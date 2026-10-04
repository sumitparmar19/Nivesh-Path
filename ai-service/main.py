"""FastAPI entrypoint for the Nivesh-Path AI advisor microservice (port 8001)."""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from pymongo.database import Database

from fastapi import Depends, FastAPI, HTTPException, Path
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from schemas import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    IndexStatus,
    IngestTransactionsRequest,
    MemoryStatus,
)
from services.llm_service import LLMService, LLMUnavailableError
from services.mongo_store import PatternStore, TradeStore, connect
from services.portfolio_analytics import compute_metrics, rule_based_insight
from services.vector_service import VectorService
from startup import RebuildReport, rebuild_user, rebuild_vector_index

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

settings = get_settings()

if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.2)

index_report = RebuildReport()


@lru_cache
def get_mongo_db() -> Database | None:
    """Shared MongoDB handle (None when MONGO_URL is unset, e.g. in tests or local dev)."""
    try:
        return connect(get_settings())
    except Exception:
        logger.exception("Invalid MONGO_URL; running without MongoDB")
        return None


def get_trade_store() -> TradeStore | None:
    """Durable trade history written by the Node backend."""
    db = get_mongo_db()
    return TradeStore(db) if db is not None else None


def get_pattern_store() -> PatternStore | None:
    """Durable store for behavioral-pattern results (Phase 2C detectors write here)."""
    db = get_mongo_db()
    return PatternStore(db) if db is not None else None


def _cold_start() -> None:
    """Runs once at boot in a background thread so the health check passes immediately."""
    patterns = get_pattern_store()
    if patterns is not None:
        try:
            patterns.ensure_indexes()
        except Exception:
            logger.exception("Could not create behavioral_patterns indexes")
    rebuild_vector_index(get_vector_service(), get_trade_store(), index_report)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Re-populate ChromaDB from MongoDB on cold start (the filesystem is wiped on each deploy)."""
    threading.Thread(target=_cold_start, name="chroma-rebuild", daemon=True).start()
    yield


app = FastAPI(
    title="Nivesh-Path AI Service",
    version="1.1.0",
    description="Portfolio AI Advisor: Claude + LangChain + ChromaDB RAG.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@lru_cache
def get_vector_service() -> VectorService:
    """Singleton vector store."""
    return VectorService(get_settings())


@lru_cache
def get_llm_service() -> LLMService:
    """Singleton Claude client."""
    return LLMService(get_settings())


@app.get("/health")
def health(llm: LLMService = Depends(get_llm_service)) -> dict[str, object]:
    """Liveness probe; also reports whether Claude is configured and the RAG index rebuild status."""
    return {
        "status": "ok",
        "llm_configured": llm.available,
        "model": llm.model,
        "vector_index": index_report.as_dict(),
    }


@app.post("/api/ai/transactions")
def ingest_transactions(
    body: IngestTransactionsRequest,
    vectors: VectorService = Depends(get_vector_service),
) -> dict[str, int]:
    """Store a user's transactions in ChromaDB so later analyses can retrieve them."""
    try:
        stored = vectors.add_transactions(body.user_id, body.transactions)
    except Exception as exc:
        logger.exception("Failed to ingest transactions")
        raise HTTPException(status_code=500, detail="Could not store transactions") from exc
    return {"stored": stored}


def _memory_status(
    user_id: str, vectors: VectorService, patterns: PatternStore | None
) -> MemoryStatus:
    stored: list[dict] = []
    if patterns is not None:
        try:
            stored = patterns.for_user(user_id)
        except Exception:
            logger.exception("Could not read behavioral patterns")
    report = index_report.as_dict()
    return MemoryStatus(
        user_id=user_id,
        indexed_trades=vectors.count(user_id),
        durable_storage=patterns is not None,
        index=IndexStatus(**{k: report[k] for k in ("status", "users", "transactions", "seconds")}),
        patterns=stored,
    )


@app.get("/api/ai/memory/{user_id}", response_model=MemoryStatus)
def memory_status(
    user_id: str = Path(..., max_length=128),
    vectors: VectorService = Depends(get_vector_service),
    patterns: PatternStore | None = Depends(get_pattern_store),
) -> MemoryStatus:
    """What the advisor currently remembers for one user: indexed trades, rebuild status, stored patterns."""
    return _memory_status(user_id, vectors, patterns)


@app.post("/api/ai/memory/{user_id}/rebuild", response_model=MemoryStatus)
def rebuild_memory(
    user_id: str = Path(..., max_length=128),
    vectors: VectorService = Depends(get_vector_service),
    trades: TradeStore | None = Depends(get_trade_store),
    patterns: PatternStore | None = Depends(get_pattern_store),
) -> MemoryStatus:
    """Re-embed one user's trades from MongoDB into ChromaDB (same as the boot-time rebuild, for one user)."""
    if trades is None:
        raise HTTPException(status_code=503, detail="MongoDB is not configured for the AI service")
    try:
        rebuild_user(vectors, trades, user_id)
    except Exception as exc:
        logger.exception("Manual rebuild failed")
        raise HTTPException(status_code=502, detail="Could not rebuild from MongoDB") from exc
    return _memory_status(user_id, vectors, patterns)


@app.post("/api/ai/analyze-portfolio", response_model=AnalyzePortfolioResponse)
def analyze_portfolio(
    body: AnalyzePortfolioRequest,
    vectors: VectorService = Depends(get_vector_service),
    llm: LLMService = Depends(get_llm_service),
    trades: TradeStore | None = Depends(get_trade_store),
) -> AnalyzePortfolioResponse:
    """Compute portfolio metrics, retrieve relevant history (RAG) and ask Claude for insights.

    Falls back to a rule-based insight when Claude is unavailable, so the endpoint
    always returns a useful answer.
    """
    try:
        metrics = compute_metrics(body.holdings)
    except Exception as exc:
        logger.exception("Metric computation failed")
        raise HTTPException(status_code=422, detail="Invalid holdings") from exc

    if trades is not None and body.user_id != "anonymous" and not vectors.has_history(body.user_id):
        # Lazy rebuild: covers users whose index is missing (boot rebuild still running or failed).
        try:
            rebuild_user(vectors, trades, body.user_id)
        except Exception:
            logger.exception("Lazy ChromaDB rebuild failed; analysing without history")

    history = vectors.search(body.user_id, body.holdings, body.question)

    try:
        insight, model = llm.generate_insight(metrics, history, body.risk_profile, body.question)
        ai_generated = True
    except LLMUnavailableError as exc:
        logger.warning("Using rule-based insight: %s", exc)
        insight, ai_generated, model = rule_based_insight(metrics), False, None

    return AnalyzePortfolioResponse(
        metrics=metrics,
        insight=insight,
        ai_generated=ai_generated,
        model=model,
        relevant_history=[d.page_content for d in history],
    )

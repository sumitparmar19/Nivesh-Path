"""FastAPI entrypoint for the Nivesh-Path AI advisor microservice (port 8001)."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from functools import lru_cache

from pymongo.database import Database

import hmac

from fastapi import Depends, FastAPI, HTTPException, Path, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from config import get_settings
from schemas import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    BehaviorRequest,
    BehaviorResponse,
    IndexStatus,
    IngestTransactionsRequest,
    MemoryStatus,
)
from services.behavior_coach import rule_based_coaching
from services.llm_service import LLMService, LLMUnavailableError
from services.mongo_store import PatternStore, TradeStore, connect
from services.portfolio_analytics import compute_metrics, rule_based_insight
from services.vector_service import VectorService, history_lines
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
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_internal_token(request: Request, call_next):  # type: ignore[no-untyped-def]
    """When AI_INTERNAL_TOKEN is set, only callers sending it (the Node backend) get through.

    Defence in depth: on DigitalOcean the service has no public route anyway. /health stays open for the
    platform's health check; nothing there is user data.
    """
    token = get_settings().ai_internal_token
    if token and request.url.path != "/health":
        sent = request.headers.get("x-internal-token", "")
        if not hmac.compare_digest(sent.encode(), token.encode()):
            return JSONResponse(status_code=401, content={"detail": "Missing or invalid internal token"})
    response: Response = await call_next(request)
    return response


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


@app.delete("/api/ai/memory/{user_id}")
def delete_memory(
    user_id: str = Path(..., max_length=128),
    vectors: VectorService = Depends(get_vector_service),
    patterns: PatternStore | None = Depends(get_pattern_store),
) -> dict[str, bool]:
    """Forget a user's indexed trades and stored behavior results (reset or account deletion)."""
    try:
        if patterns is not None:
            patterns.delete_user(user_id)
        return {"deleted": vectors.delete_user(user_id)}
    except Exception as exc:
        logger.exception("Memory delete failed")
        raise HTTPException(status_code=500, detail="Could not delete memory") from exc


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
        metrics = compute_metrics(body.holdings, body.cash_balance)
    except Exception as exc:
        logger.exception("Metric computation failed")
        raise HTTPException(status_code=422, detail="Invalid holdings") from exc

    if trades is not None and body.user_id != "anonymous" and not vectors.has_history(body.user_id):
        # Lazy rebuild: covers users whose index is missing (boot rebuild still running or failed).
        try:
            rebuild_user(vectors, trades, body.user_id)
        except Exception:
            logger.exception("Lazy ChromaDB rebuild failed; analysing without history")

    # Most relevant past trades, listed in time order with dates in the user's own time zone.
    history = history_lines(vectors.search(body.user_id, body.holdings, body.question), body.timezone)

    try:
        insight, model = llm.generate_insight(metrics, history, body.risk_profile, body.question)
        # The score is computed in code (same formula as the Behavioral Mirror); the model may not change it.
        insight = insight.model_copy(update={"diversification_score": metrics.diversification_score})
        ai_generated = True
    except LLMUnavailableError as exc:
        logger.warning("Using rule-based insight: %s", exc)
        insight, ai_generated, model = rule_based_insight(metrics), False, None

    return AnalyzePortfolioResponse(
        metrics=metrics,
        insight=insight,
        ai_generated=ai_generated,
        model=model,
        relevant_history=history,
    )


COACH_KEY = "coach_insight"


@app.post("/api/ai/behavior/{user_id}", response_model=BehaviorResponse)
def analyze_behavior(
    body: BehaviorRequest,
    user_id: str = Path(..., max_length=128),
    llm: LLMService = Depends(get_llm_service),
    patterns: PatternStore | None = Depends(get_pattern_store),
) -> BehaviorResponse:
    """Behavioral Mirror coaching: explain the user's detected habits (panic sells, FOMO buys, concentration).

    All numbers come pre-computed from the Node detectors. Claude only writes the words; without a key or on
    any API failure a rule-based coach answers instead. With nothing to analyse, Claude is not called at all.
    The result (and a per-type count summary) is saved to PatternStore so it survives deploys.
    """
    coaching, ai_generated, model = rule_based_coaching(body), False, None
    if body.events:
        try:
            coaching, model = llm.generate_behavior_coaching(body)
            ai_generated = True
        except LLMUnavailableError as exc:
            logger.warning("Using rule-based behavior coaching: %s", exc)

    result = BehaviorResponse(
        **coaching.model_dump(),
        ai_generated=ai_generated,
        model=model,
        created_at=datetime.now(timezone.utc).isoformat(),
        fingerprint=body.fingerprint,
    )
    if patterns is not None:
        try:
            patterns.upsert(user_id, COACH_KEY, result.model_dump())
            for pattern_type, count in body.counts.items():
                latest = next((e.model_dump() for e in body.events if e.pattern_type == pattern_type), None)
                patterns.upsert(user_id, pattern_type, {"count": count, "latest": latest})
        except Exception:
            logger.exception("Could not save behavior coaching")
    return result


@app.get("/api/ai/behavior/{user_id}", response_model=BehaviorResponse)
def last_behavior(
    user_id: str = Path(..., max_length=128),
    patterns: PatternStore | None = Depends(get_pattern_store),
) -> BehaviorResponse:
    """The last saved Behavioral Mirror coaching for a user (404 if there is none yet)."""
    saved = patterns.get(user_id, COACH_KEY) if patterns is not None else None
    if not saved:
        raise HTTPException(status_code=404, detail="No behavior insight yet")
    return BehaviorResponse(**saved)

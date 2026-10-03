"""FastAPI entrypoint for the Nivesh-Path AI advisor microservice (port 8001)."""

from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from schemas import (
    AnalyzePortfolioRequest,
    AnalyzePortfolioResponse,
    IngestTransactionsRequest,
)
from services.llm_service import LLMService, LLMUnavailableError
from services.portfolio_analytics import compute_metrics, rule_based_insight
from services.vector_service import VectorService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-service")

settings = get_settings()

if settings.sentry_dsn:
    import sentry_sdk

    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.2)

app = FastAPI(
    title="Nivesh-Path AI Service",
    version="1.0.0",
    description="Portfolio AI Advisor: Claude + LangChain + ChromaDB RAG.",
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
    """Liveness probe; also reports whether Claude is configured."""
    return {"status": "ok", "llm_configured": llm.available, "model": llm.model}


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


@app.post("/api/ai/analyze-portfolio", response_model=AnalyzePortfolioResponse)
def analyze_portfolio(
    body: AnalyzePortfolioRequest,
    vectors: VectorService = Depends(get_vector_service),
    llm: LLMService = Depends(get_llm_service),
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

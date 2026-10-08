"""Pydantic request/response models for the AI service API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Holding(BaseModel):
    """One position in the user's portfolio."""

    symbol: str = Field(..., min_length=1, max_length=12, examples=["AAPL"])
    quantity: float = Field(..., gt=0)
    avg_price: float = Field(..., gt=0, description="Average cost per share (USD)")
    current_price: float | None = Field(
        None, gt=0, description="Latest market price; falls back to avg_price when missing"
    )
    sector: str | None = None


class Transaction(BaseModel):
    """A historical buy/sell, stored in the vector DB for RAG retrieval."""

    symbol: str
    quantity: float = Field(..., gt=0)
    price: float = Field(..., gt=0)
    transaction_type: Literal["buy", "sell"]
    timestamp: datetime | None = None


class AnalyzePortfolioRequest(BaseModel):
    """Body for POST /api/ai/analyze-portfolio."""

    user_id: str = Field("anonymous", max_length=128)
    holdings: list[Holding] = Field(..., min_length=1, max_length=200)
    question: str | None = Field(
        None, max_length=1000, description="Optional free-form question for the advisor"
    )
    risk_profile: Literal["conservative", "moderate", "aggressive"] = "moderate"


class IngestTransactionsRequest(BaseModel):
    """Body for POST /api/ai/transactions."""

    user_id: str = Field("anonymous", max_length=128)
    transactions: list[Transaction] = Field(..., min_length=1, max_length=1000)


class PositionMetrics(BaseModel):
    """Deterministic per-position numbers computed before the LLM is called."""

    symbol: str
    market_value: float
    cost_basis: float
    unrealized_pl: float
    unrealized_pl_pct: float
    weight_pct: float


class PortfolioMetrics(BaseModel):
    """Portfolio-level analytics."""

    total_value: float
    total_cost: float
    total_unrealized_pl: float
    total_unrealized_pl_pct: float
    position_count: int
    largest_position: str
    largest_weight_pct: float
    concentration_hhi: float = Field(
        ..., description="Herfindahl-Hirschman index of weights (0-10000); >2500 = concentrated"
    )
    positions: list[PositionMetrics]


class Recommendation(BaseModel):
    """One actionable suggestion from the advisor."""

    action: Literal["buy", "sell", "hold", "rebalance", "research"]
    symbol: str | None = None
    rationale: str


class AIInsight(BaseModel):
    """Structured output Claude must return."""

    summary: str
    risk_level: Literal["low", "medium", "high"]
    diversification_score: int = Field(..., ge=0, le=100)
    strengths: list[str]
    risks: list[str]
    recommendations: list[Recommendation]
    answer: str | None = Field(None, description="Answer to the user's question, if one was asked")


class AnalyzePortfolioResponse(BaseModel):
    """Body returned by POST /api/ai/analyze-portfolio."""

    metrics: PortfolioMetrics
    insight: AIInsight
    ai_generated: bool = Field(..., description="False when the rule-based fallback produced the insight")
    model: str | None = None
    relevant_history: list[str] = Field(default_factory=list)
    disclaimer: str = "Educational insights only - not financial advice."


class IndexStatus(BaseModel):
    """Public summary of the boot-time ChromaDB rebuild (no user ids)."""

    status: Literal["pending", "running", "ok", "failed", "disabled"]
    users: int = 0
    transactions: int = 0
    seconds: float = 0.0


class MemoryStatus(BaseModel):
    """Body returned by the /api/ai/memory endpoints: what the advisor remembers about one user."""

    user_id: str
    indexed_trades: int = Field(..., description="Trades currently embedded in the user's ChromaDB collection")
    durable_storage: bool = Field(..., description="True when MongoDB is configured, so memory survives deploys")
    index: IndexStatus
    patterns: list[dict] = Field(default_factory=list, description="Stored behavioral-pattern results (Phase 2C)")


# ---------- Behavioral Mirror (Phase 2C) ----------
PatternType = Literal["panic_sell", "fomo_buy", "overconcentration"]
Severity = Literal["low", "medium", "high"]


class BehaviorEvent(BaseModel):
    """One detected pattern, with the numbers the Node detectors already computed."""

    pattern_type: PatternType
    severity: Severity
    symbol: str = Field(..., max_length=10)
    facts: dict[str, float | None] = Field(default_factory=dict)
    created_at: str | None = None


class BehaviorScores(BaseModel):
    """Scores computed in code (0-100, higher is healthier); the AI only explains them."""

    impulseControl: int | None = Field(None, ge=0, le=100)
    diversification: int = Field(..., ge=0, le=100)
    tradeCount: int = Field(..., ge=0)
    flaggedTrades: int = Field(..., ge=0)
    enoughTrades: bool


class LargestPosition(BaseModel):
    """The biggest single stock as a share of cash + holdings."""

    symbol: str
    percent: float


class BehaviorRequest(BaseModel):
    """Body of POST /api/ai/behavior/{user_id}."""

    scores: BehaviorScores
    counts: dict[PatternType, int] = Field(default_factory=dict)
    largest_position: LargestPosition | None = None
    events: list[BehaviorEvent] = Field(default_factory=list, max_length=50)


class BehaviorCoaching(BaseModel):
    """Structured output Claude must return for the Behavioral Mirror."""

    headline: str = Field(..., description="One short line naming the user's main habit")
    insight: str = Field(..., description="2-3 sentences in second person, citing the user's own trades")
    suggestion: str = Field(..., description="One concrete habit to try on the next trade")


class BehaviorResponse(BehaviorCoaching):
    """Body returned by the /api/ai/behavior endpoints (also saved to PatternStore)."""

    ai_generated: bool
    model: str | None = None
    created_at: str
    disclaimer: str = "Educational insights only - not financial advice."

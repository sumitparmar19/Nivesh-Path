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

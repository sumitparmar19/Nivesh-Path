"""Unit tests for the deterministic portfolio math and rule-based fallback."""

from __future__ import annotations

import pytest

from schemas import Holding
from services.portfolio_analytics import compute_metrics, rule_based_insight
from services.vector_service import EMBEDDING_DIM, embed_texts


def test_metrics_merge_duplicates_and_compute_pl() -> None:
    metrics = compute_metrics(
        [
            Holding(symbol="aapl", quantity=10, avg_price=100, current_price=120),
            Holding(symbol="AAPL", quantity=10, avg_price=140, current_price=120),
            Holding(symbol="MSFT", quantity=4, avg_price=400),
        ]
    )
    assert metrics.position_count == 2
    aapl = next(p for p in metrics.positions if p.symbol == "AAPL")
    assert aapl.cost_basis == 2400
    assert aapl.market_value == 2400
    assert metrics.total_value == 4000
    assert metrics.largest_position == "AAPL"
    assert metrics.largest_weight_pct == 60
    assert metrics.concentration_hhi == pytest.approx(60**2 + 40**2)


def test_single_position_is_high_risk() -> None:
    insight = rule_based_insight(compute_metrics([Holding(symbol="TSLA", quantity=1, avg_price=300, current_price=200)]))
    assert insight.risk_level == "high"
    assert any(r.action == "rebalance" for r in insight.recommendations)
    assert any(r.action == "research" for r in insight.recommendations)


def test_embeddings_are_normalised_and_deterministic() -> None:
    a, b = embed_texts(["BUY 10 shares of AAPL", "BUY 10 shares of AAPL"])
    assert len(a) == EMBEDDING_DIM
    assert a == b
    assert sum(v * v for v in a) == pytest.approx(1.0)

"""Phase 2C follow-up: the Advisor measures weights against the whole account (cash included), uses the
same Diversification formula as the Behavioral Mirror, lists history in time order in the user's time
zone, never talks about taxes, and accepts calls only with the internal token when one is configured."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import chromadb
import pytest
from fastapi.testclient import TestClient

import main
from config import Settings, get_settings
from schemas import AIInsight, Holding, Recommendation, Transaction
from services.llm_service import LLMService
from services.portfolio_analytics import compute_metrics, diversification_score, rule_based_insight
from services.vector_service import VectorService, history_lines, transaction_to_document

# The live-test account from Oct 8, 2026: $78,298.38 cash and three positions ($21,701.62).
LIVE = [
    Holding(symbol="SPY", quantity=11, avg_price=773.93, current_price=773.93),
    Holding(symbol="MSFT", quantity=7, avg_price=522.61, current_price=522.61),
    Holding(symbol="INTC", quantity=89, avg_price=107.08, current_price=107.08),
]
CASH = 78298.38


def test_live_account_weights_include_cash() -> None:
    m = compute_metrics(LIVE, CASH)
    intc = next(p for p in m.positions if p.symbol == "INTC")
    assert m.account_value == pytest.approx(100000.0, abs=0.01)
    assert m.cash_pct == pytest.approx(78.3, abs=0.01)
    assert intc.weight_pct == pytest.approx(9.53, abs=0.01)  # share of the whole account
    assert intc.invested_weight_pct == pytest.approx(43.91, abs=0.01)  # share of invested money, labelled
    assert m.largest_position == "INTC" and m.concentration_level == "none"
    assert m.diversification_score == 90  # same as the Behavioral Mirror for this account


def test_rule_based_advice_does_not_tell_the_live_account_to_trim_intc() -> None:
    insight = rule_based_insight(compute_metrics(LIVE, CASH))
    assert insight.risk_level == "low"
    assert not any(r.action == "rebalance" for r in insight.recommendations)
    assert insight.diversification_score == 90


def test_without_cash_weights_are_shares_of_invested_money_as_before() -> None:
    m = compute_metrics(LIVE)
    assert next(p for p in m.positions if p.symbol == "INTC").weight_pct == pytest.approx(43.91, abs=0.01)
    assert m.concentration_level == "low"


def test_diversification_rounds_like_javascript() -> None:
    # Node uses Math.round (halves up); Python's round() would give 86 here.
    assert diversification_score(13.5) == 87
    assert diversification_score(9.53) == 90


class FakeMessages:
    def __init__(self, result: Any) -> None:
        self.result, self.calls = result, []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        return self.result


@pytest.fixture
def vectors() -> VectorService:
    client = chromadb.EphemeralClient()
    for collection in client.list_collections():
        client.delete_collection(getattr(collection, "name", collection))
    return VectorService(get_settings(), client=client)


@pytest.fixture(autouse=True)
def clear_overrides() -> Any:
    yield
    main.app.dependency_overrides.clear()


def test_advisor_uses_cash_overrides_claudes_score_and_rules_out_taxes(vectors: VectorService) -> None:
    claude_says = AIInsight(
        summary="s", risk_level="medium", diversification_score=40, strengths=["a"], risks=["b"],
        recommendations=[Recommendation(action="hold", rationale="x")],
    )
    fake = FakeMessages(SimpleNamespace(stop_reason="end_turn", parsed_output=claude_says, model="claude-opus-5-5"))
    llm = LLMService(get_settings(), client=SimpleNamespace(beta=SimpleNamespace(messages=fake)))
    main.app.dependency_overrides[main.get_vector_service] = lambda: vectors
    main.app.dependency_overrides[main.get_llm_service] = lambda: llm
    holdings = [h.model_dump() for h in LIVE]
    body = TestClient(main.app).post("/api/ai/analyze-portfolio", json={"holdings": holdings, "cash_balance": CASH}).json()
    assert body["insight"]["diversification_score"] == 90  # Claude said 40; the code's value wins
    assert body["metrics"]["cash"] == CASH
    system = fake.calls[0]["system"]
    assert "never mention tax" in system and "WHOLE account" in system and "2500" not in system


def test_history_is_in_time_order_with_dates_in_the_users_time_zone(vectors: VectorService) -> None:
    trades = [
        Transaction(symbol="INTC", quantity=89, price=107.08, transaction_type="buy", timestamp=datetime(2026, 10, 9, 5, 38, tzinfo=timezone.utc)),
        Transaction(symbol="SPY", quantity=4, price=773.93, transaction_type="buy", timestamp=datetime(2026, 10, 9, 5, 16, tzinfo=timezone.utc)),
        Transaction(symbol="MSFT", quantity=7, price=522.61, transaction_type="buy", timestamp=datetime(2026, 10, 9, 5, 37, tzinfo=timezone.utc)),
    ]
    docs = [transaction_to_document("u1", t) for t in trades]
    lines = history_lines(docs, "America/Los_Angeles")
    assert [line.split(" shares of ")[1].split()[0] for line in lines] == ["SPY", "MSFT", "INTC"]
    assert lines[0].endswith("on 2026-10-08 10:16 PM")
    assert history_lines(docs, None)[0].endswith("on 2026-10-09 5:16 AM UTC")
    assert history_lines(docs, "Not/AZone")[0].endswith("UTC")


def test_internal_token_is_required_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    secured = Settings(**{**get_settings().__dict__, "ai_internal_token": "s3cret"})
    monkeypatch.setattr(main, "get_settings", lambda: secured)
    client = TestClient(main.app)
    assert client.get("/health").status_code == 200  # platform health check stays open
    assert client.get("/api/ai/behavior/u1").status_code == 401
    assert client.get("/api/ai/behavior/u1", headers={"X-Internal-Token": "wrong"}).status_code == 401
    assert client.get("/api/ai/behavior/u1", headers={"X-Internal-Token": "s3cret"}).status_code in (404, 200)

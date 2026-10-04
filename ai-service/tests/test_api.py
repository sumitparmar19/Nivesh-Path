"""API tests for the AI service. Claude is mocked; ChromaDB runs in-memory."""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Any

import anthropic
import chromadb
import httpx
import pytest
from fastapi.testclient import TestClient

import main
from config import get_settings
from schemas import AIInsight, Holding, Recommendation, Transaction
from services.llm_service import LLMService
from services.vector_service import VectorService, collection_name_for

HOLDINGS = [
    {"symbol": "AAPL", "quantity": 10, "avg_price": 150, "current_price": 180},
    {"symbol": "NVDA", "quantity": 5, "avg_price": 100, "current_price": 130},
    {"symbol": "tsla", "quantity": 2, "avg_price": 300, "current_price": 200},
]

FAKE_INSIGHT = AIInsight(
    summary="Tech-heavy portfolio with solid gains.",
    risk_level="medium",
    diversification_score=55,
    strengths=["Strong AAPL gains"],
    risks=["Sector concentration in tech"],
    recommendations=[Recommendation(action="rebalance", symbol="AAPL", rationale="Trim winner")],
    answer=None,
)


class FakeMessages:
    """Stands in for client.beta.messages and records the request."""

    def __init__(self, result: Any = None, error: Exception | None = None) -> None:
        self.result, self.error, self.calls = result, error, []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


def make_client(messages: FakeMessages) -> Any:
    return SimpleNamespace(beta=SimpleNamespace(messages=messages))


@pytest.fixture
def vectors() -> VectorService:
    client = chromadb.EphemeralClient()
    # The in-memory client is shared per process, so start each test with no collections.
    for collection in client.list_collections():
        client.delete_collection(getattr(collection, "name", collection))
    return VectorService(get_settings(), client=client)


def build_app(vectors: VectorService, llm: LLMService) -> TestClient:
    main.app.dependency_overrides[main.get_vector_service] = lambda: vectors
    main.app.dependency_overrides[main.get_llm_service] = lambda: llm
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_overrides() -> Any:
    yield
    main.app.dependency_overrides.clear()


def test_health_reports_llm_status(vectors: VectorService) -> None:
    llm = LLMService(get_settings(), client=None)
    llm._client = None
    resp = build_app(vectors, llm).get("/health")
    assert resp.status_code == 200
    assert resp.json()["llm_configured"] is False


def test_analyze_uses_claude_and_rag(vectors: VectorService) -> None:
    user = f"user-{uuid.uuid4()}"
    fake = FakeMessages(SimpleNamespace(stop_reason="end_turn", parsed_output=FAKE_INSIGHT, model="claude-opus-5-5"))
    client = build_app(vectors, LLMService(get_settings(), client=make_client(fake)))

    ingest = client.post(
        "/api/ai/transactions",
        json={
            "user_id": user,
            "transactions": [
                {"symbol": "AAPL", "quantity": 10, "price": 150, "transaction_type": "buy"},
                {"symbol": "TSLA", "quantity": 2, "price": 300, "transaction_type": "buy"},
            ],
        },
    )
    assert ingest.json() == {"stored": 2}

    resp = client.post(
        "/api/ai/analyze-portfolio",
        json={"user_id": user, "holdings": HOLDINGS, "question": "Should I sell Tesla?"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ai_generated"] is True
    assert body["model"] == "claude-opus-5-5"
    assert body["insight"]["summary"] == FAKE_INSIGHT.summary
    assert any("TSLA" in h for h in body["relevant_history"])

    request = fake.calls[0]
    assert request["output_format"] is AIInsight
    assert request["fallbacks"] == "default"
    assert "Should I sell Tesla?" in request["messages"][0]["content"]
    assert "TSLA" in request["messages"][0]["content"]


def test_history_is_scoped_per_user(vectors: VectorService) -> None:
    vectors.add_transactions("alice", [Transaction(symbol="AAPL", quantity=1, price=10, transaction_type="buy")])
    assert vectors.search("bob", [Holding(symbol="AAPL", quantity=1, avg_price=1)], None) == []
    assert len(vectors.search("alice", [Holding(symbol="AAPL", quantity=1, avg_price=1)], None)) == 1


def test_each_user_gets_a_separate_collection(vectors: VectorService) -> None:
    tx = [Transaction(symbol="TSLA", quantity=2, price=200, transaction_type="buy")]
    vectors.add_transactions("64f1c2aa0000000000000001", tx)
    vectors.add_transactions("64f1c2aa0000000000000002", tx)
    names = sorted(getattr(c, "name", c) for c in vectors._client.list_collections())
    assert names == [
        collection_name_for("64f1c2aa0000000000000001"),
        collection_name_for("64f1c2aa0000000000000002"),
    ]


def test_collection_names_are_sanitised() -> None:
    assert collection_name_for("../evil id") == "transactions_user____evil_id"
    assert collection_name_for("") == "transactions_user_anonymous"


def test_same_day_identical_trades_are_both_kept(vectors: VectorService) -> None:
    from datetime import datetime

    trades = [
        Transaction(symbol="NVDA", quantity=1, price=100, transaction_type="buy", timestamp=datetime(2026, 10, 1, 10, 0)),
        Transaction(symbol="NVDA", quantity=1, price=100, transaction_type="buy", timestamp=datetime(2026, 10, 1, 15, 0)),
    ]
    vectors.add_transactions("carol", trades)
    assert len(vectors.search("carol", [Holding(symbol="NVDA", quantity=2, avg_price=100)], None)) == 2


def test_falls_back_to_rules_without_api_key(vectors: VectorService) -> None:
    llm = LLMService(get_settings(), client=None)
    llm._client = None
    resp = build_app(vectors, llm).post("/api/ai/analyze-portfolio", json={"holdings": HOLDINGS})
    body = resp.json()
    assert resp.status_code == 200
    assert body["ai_generated"] is False
    assert body["metrics"]["position_count"] == 3
    assert body["insight"]["recommendations"]


def test_falls_back_on_api_error(vectors: VectorService) -> None:
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.APIConnectionError(request=request)
    llm = LLMService(get_settings(), client=make_client(FakeMessages(error=error)))
    body = build_app(vectors, llm).post("/api/ai/analyze-portfolio", json={"holdings": HOLDINGS}).json()
    assert body["ai_generated"] is False


def test_falls_back_on_refusal(vectors: VectorService) -> None:
    fake = FakeMessages(SimpleNamespace(stop_reason="refusal", parsed_output=None, model="x"))
    llm = LLMService(get_settings(), client=make_client(fake))
    body = build_app(vectors, llm).post("/api/ai/analyze-portfolio", json={"holdings": HOLDINGS}).json()
    assert body["ai_generated"] is False


def test_rejects_empty_holdings(vectors: VectorService) -> None:
    llm = LLMService(get_settings(), client=None)
    resp = build_app(vectors, llm).post("/api/ai/analyze-portfolio", json={"holdings": []})
    assert resp.status_code == 422

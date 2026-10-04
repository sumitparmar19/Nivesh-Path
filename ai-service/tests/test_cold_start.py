"""Cold-start tests: ChromaDB is wiped (as on every DigitalOcean deploy) and rebuilt from MongoDB.

MongoDB is simulated with mongomock, Chroma runs in-memory and Claude is mocked.
"""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any

import chromadb
import mongomock
import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

import main
from config import get_settings
from schemas import AIInsight, Holding, Recommendation
from services.llm_service import LLMService
from services.mongo_store import PatternStore, TradeStore
from services.vector_service import VectorService
from startup import rebuild_vector_index

ALICE = ObjectId("64f1c2aa0000000000000001")
BOB = ObjectId("64f1c2aa0000000000000002")

INSIGHT = AIInsight(
    summary="Concentrated in Tesla.",
    risk_level="high",
    diversification_score=20,
    strengths=["Clear conviction"],
    risks=["Single-stock concentration"],
    recommendations=[Recommendation(action="rebalance", symbol="TSLA", rationale="Too concentrated")],
    answer=None,
)


def trade(user: ObjectId | None, symbol: str, qty: float, price: float, kind: str, day: int) -> dict[str, Any]:
    """A `purchases` document shaped exactly like the Node backend's Mongoose model."""
    doc: dict[str, Any] = {
        "name": symbol,
        "quantity": qty,
        "price": price,
        "total": qty * price,
        "transactionType": kind,
        "timestamp": datetime(2026, 9, day, 15, 30, tzinfo=timezone.utc),
        "priceSource": "live",
    }
    if user is not None:
        doc["userId"] = user
    return doc


@pytest.fixture
def db() -> Any:
    database = mongomock.MongoClient(tz_aware=True)["niveshpath"]
    database.purchases.insert_many(
        [
            trade(ALICE, "TSLA", 10, 250, "buy", 1),
            trade(ALICE, "TSLA", 4, 210, "sell", 3),
            trade(ALICE, "AAPL", 5, 180, "buy", 5),
            trade(BOB, "NVDA", 3, 120, "buy", 2),
            trade(None, "MSFT", 1, 400, "buy", 2),  # legacy row from before per-user accounts
            {"userId": BOB, "name": "BAD", "quantity": "lots", "price": 1, "transactionType": "buy"},
        ]
    )
    return database


@pytest.fixture
def vectors() -> VectorService:
    service = VectorService(get_settings(), client=chromadb.EphemeralClient())
    service.clear()
    return service


@pytest.fixture(autouse=True)
def clear_overrides() -> Any:
    yield
    main.app.dependency_overrides.clear()


def build_app(vectors: VectorService, trades: TradeStore | None) -> tuple[TestClient, Any]:
    fake = SimpleNamespace(calls=[])

    def parse(**kwargs: Any) -> Any:
        fake.calls.append(kwargs)
        return SimpleNamespace(stop_reason="end_turn", parsed_output=INSIGHT, model="claude-opus-5-5")

    llm = LLMService(get_settings(), client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    main.app.dependency_overrides[main.get_vector_service] = lambda: vectors
    main.app.dependency_overrides[main.get_llm_service] = lambda: llm
    main.app.dependency_overrides[main.get_trade_store] = lambda: trades
    return TestClient(main.app), fake


def test_cold_start_rebuild_then_advisor_answers_for_existing_user(db: Any, vectors: VectorService) -> None:
    trades = TradeStore(db)
    vectors.add_transactions(str(ALICE), trades.transactions_for(str(ALICE)))
    assert vectors.has_history(str(ALICE))

    vectors.clear()  # simulate a deploy: the container filesystem (and ChromaDB) is gone
    assert not vectors.has_history(str(ALICE))

    report = rebuild_vector_index(vectors, trades)
    assert report.status == "ok"
    assert report.users == 2
    assert report.transactions == 4  # legacy row without userId and the malformed row are skipped

    client, fake = build_app(vectors, trades)
    resp = client.post(
        "/api/ai/analyze-portfolio",
        json={
            "user_id": str(ALICE),
            "holdings": [{"symbol": "TSLA", "quantity": 6, "avg_price": 250, "current_price": 220}],
            "question": "Did I panic sell Tesla?",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ai_generated"] is True
    assert body["insight"]["summary"] == INSIGHT.summary
    assert any("SELL 4 shares of TSLA" in h for h in body["relevant_history"])
    assert not any("NVDA" in h for h in body["relevant_history"])  # Bob's trades never leak
    assert "SELL 4 shares of TSLA" in fake.calls[0]["messages"][0]["content"]


def test_rebuild_is_idempotent(db: Any, vectors: VectorService) -> None:
    trades = TradeStore(db)
    rebuild_vector_index(vectors, trades)
    rebuild_vector_index(vectors, trades)
    found = vectors.search(str(ALICE), [Holding(symbol="TSLA", quantity=1, avg_price=1)], None, k=20)
    assert len(found) == 3


def test_lazy_rebuild_when_index_missing(db: Any, vectors: VectorService) -> None:
    client, _ = build_app(vectors, TradeStore(db))  # boot rebuild never ran
    resp = client.post(
        "/api/ai/analyze-portfolio",
        json={"user_id": str(BOB), "holdings": [{"symbol": "NVDA", "quantity": 3, "avg_price": 120}]},
    )
    assert resp.status_code == 200
    assert any("NVDA" in h for h in resp.json()["relevant_history"])


def test_rebuild_disabled_without_mongo(vectors: VectorService) -> None:
    assert rebuild_vector_index(vectors, None).status == "disabled"


def test_rebuild_failure_is_reported_not_raised(vectors: VectorService) -> None:
    class BrokenStore:
        def transactions_by_user(self) -> Any:
            raise ConnectionError("Atlas unreachable")

    report = rebuild_vector_index(vectors, BrokenStore())  # type: ignore[arg-type]
    assert report.status == "failed"
    assert report.error == "ConnectionError"


def test_health_reports_index_status(vectors: VectorService) -> None:
    client, _ = build_app(vectors, None)
    assert "status" in client.get("/health").json()["vector_index"]


def test_behavioral_patterns_survive_in_mongo(db: Any) -> None:
    patterns = PatternStore(db)
    patterns.ensure_indexes()
    patterns.upsert(str(ALICE), "panic_sell", {"count": 1, "symbols": ["TSLA"]})
    patterns.upsert(str(ALICE), "panic_sell", {"count": 2, "symbols": ["TSLA", "AAPL"]})
    patterns.upsert(str(BOB), "fomo_buy", {"count": 1})
    alice = patterns.for_user(str(ALICE))
    assert len(alice) == 1
    assert alice[0]["result"]["count"] == 2
    assert "_id" not in alice[0]


def test_memory_endpoint_reports_indexed_trades_and_patterns(db: Any, vectors: VectorService) -> None:
    trades = TradeStore(db)
    PatternStore(db).upsert(str(ALICE), "panic_sell", {"count": 1})
    client, _ = build_app(vectors, trades)
    main.app.dependency_overrides[main.get_pattern_store] = lambda: PatternStore(db)

    before = client.get(f"/api/ai/memory/{ALICE}").json()
    assert before["indexed_trades"] == 0
    assert before["durable_storage"] is True
    assert before["patterns"][0]["pattern_type"] == "panic_sell"

    after = client.post(f"/api/ai/memory/{ALICE}/rebuild").json()
    assert after["indexed_trades"] == 3


def test_manual_rebuild_needs_mongo(vectors: VectorService) -> None:
    client, _ = build_app(vectors, None)
    main.app.dependency_overrides[main.get_pattern_store] = lambda: None
    assert client.post("/api/ai/memory/someone/rebuild").status_code == 503
    body = client.get("/api/ai/memory/someone").json()
    assert body == {
        "user_id": "someone",
        "indexed_trades": 0,
        "durable_storage": False,
        "index": body["index"],
        "patterns": [],
    }

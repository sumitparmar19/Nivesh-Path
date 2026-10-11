"""Phase 3: the AI service reads trade history through the Node web service's /internal API.

The web service is simulated with httpx.MockTransport; Chroma runs in-memory.
"""

from __future__ import annotations

from typing import Any

import chromadb
import httpx
import mongomock
import pytest

import main
from config import Settings, get_settings
from services.mongo_store import TradeStore
from services.vector_service import VectorService
from services.web_trades import HttpTradeStore
from startup import rebuild_user, rebuild_vector_index

TOKEN = "internal-test-token"
ALICE = "64f1c2aa0000000000000001"
BOB = "64f1c2aa0000000000000002"
TRADES: dict[str, list[dict[str, Any]]] = {
    ALICE: [
        {"id": "a" * 24, "symbol": "tsla", "quantity": 10, "price": 250.0, "transaction_type": "buy", "timestamp": "2026-09-01T15:30:00Z"},
        {"id": "b" * 24, "symbol": "TSLA", "quantity": 4, "price": 210.0, "transaction_type": "sell", "timestamp": "2026-09-03T15:30:00Z"},
        {"id": "c" * 24, "symbol": "BAD", "quantity": "lots", "price": 1, "transaction_type": "buy"},
    ],
    BOB: [{"id": "d" * 24, "symbol": "NVDA", "quantity": 3, "price": 120.0, "transaction_type": "buy", "timestamp": "2026-09-02T15:30:00Z"}],
}


def web(requests: list[httpx.Request], fail_first: int = 0, status: int | None = None) -> httpx.Client:
    """A fake Node web service: checks the token like src/routes/internal.js (404 otherwise)."""
    state = {"failures": fail_first}

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if state["failures"] > 0:
            state["failures"] -= 1
            raise httpx.ConnectError("web not up yet", request=request)
        if status is not None:
            return httpx.Response(status, json={"error": "nope"})
        if request.headers.get("x-internal-token") != TOKEN:
            return httpx.Response(404, json={"error": "Not found"})
        if request.url.path == "/internal/trades/users":
            return httpx.Response(200, json={"users": [ALICE, BOB]})
        if request.url.path == "/internal/trades":
            user = request.url.params["userId"]
            return httpx.Response(200, json={"userId": user, "trades": TRADES.get(user, [])})
        return httpx.Response(404, json={"error": "Not found"})

    return httpx.Client(transport=httpx.MockTransport(handler))


def store(requests: list[httpx.Request], token: str = TOKEN, sleeps: list[float] | None = None, **kw: Any) -> HttpTradeStore:
    slept = sleeps if sleeps is not None else []
    return HttpTradeStore("http://web:3000/", token, client=web(requests, **kw), sleep=slept.append)


@pytest.fixture
def vectors() -> VectorService:
    service = VectorService(get_settings(), client=chromadb.EphemeralClient())
    service.clear()
    return service


def test_reads_one_users_trades_with_the_token_skipping_malformed_rows() -> None:
    requests: list[httpx.Request] = []
    txs = store(requests).transactions_for(ALICE)
    assert [(t.symbol, t.quantity, t.transaction_type) for t in txs] == [("TSLA", 10, "buy"), ("TSLA", 4, "sell")]
    assert requests[0].url == httpx.URL(f"http://web:3000/internal/trades?userId={ALICE}")
    assert requests[0].headers["x-internal-token"] == TOKEN


def test_ids_that_cannot_be_users_make_no_request() -> None:
    requests: list[httpx.Request] = []
    assert store(requests).transactions_for("anonymous") == []
    assert store(requests).transactions_for("../internal/trades/users") == []
    assert requests == []


def test_boot_rebuild_waits_for_the_web_service_to_start(vectors: VectorService) -> None:
    requests: list[httpx.Request] = []
    sleeps: list[float] = []
    report = rebuild_vector_index(vectors, store(requests, sleeps=sleeps, fail_first=2))
    assert report.status == "ok"
    assert (report.users, report.transactions) == (2, 3)
    assert sleeps == [2.0, 4.0]
    assert vectors.has_history(ALICE) and vectors.has_history(BOB)


def test_wrong_token_fails_fast_and_is_reported_not_raised(vectors: VectorService) -> None:
    requests: list[httpx.Request] = []
    sleeps: list[float] = []
    report = rebuild_vector_index(vectors, store(requests, token="wrong", sleeps=sleeps))
    assert report.status == "failed"
    assert report.error == "HTTPStatusError"
    assert sleeps == []  # a 404 is a configuration problem, not a slow start: no retries
    assert len(requests) == 1


def test_web_down_for_good_gives_up_after_the_retries(vectors: VectorService) -> None:
    requests: list[httpx.Request] = []
    sleeps: list[float] = []
    report = rebuild_vector_index(vectors, store(requests, sleeps=sleeps, status=503))
    assert report.status == "failed"
    assert sleeps == [2.0, 4.0, 8.0, 16.0, 30.0]
    assert len(requests) == 6


def test_manual_rebuild_of_one_user(vectors: VectorService) -> None:
    requests: list[httpx.Request] = []
    assert rebuild_user(vectors, store(requests), BOB) == 1
    assert vectors.has_history(BOB) and not vectors.has_history(ALICE)


def settings_with(**changes: Any) -> Settings:
    base = get_settings()
    return Settings(**{**base.__dict__, **changes})


def test_trade_source_prefers_the_web_api_when_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: settings_with(web_internal_url="http://web:3000", ai_internal_token=TOKEN))
    assert isinstance(main.get_trade_store(), HttpTradeStore)
    # Without the token the web API would refuse every call, so it is not used.
    monkeypatch.setattr(main, "get_settings", lambda: settings_with(web_internal_url="http://web:3000", ai_internal_token=None))
    monkeypatch.setattr(main, "get_mongo_db", lambda: None)
    assert main.get_trade_store() is None
    db = mongomock.MongoClient()["niveshpath"]
    monkeypatch.setattr(main, "get_mongo_db", lambda: db)
    assert isinstance(main.get_trade_store(), TradeStore)


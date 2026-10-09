"""Behavioral Mirror coaching endpoint tests: Claude mocked, MongoDB simulated with mongomock."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import anthropic
import httpx
import mongomock
import pytest
from fastapi.testclient import TestClient

import main
from config import get_settings
from schemas import BehaviorCoaching, BehaviorEvent, BehaviorRequest
from services.behavior_coach import describe_event, rule_based_coaching
from services.llm_service import LLMService
from services.mongo_store import PatternStore

SCORES = {"impulseControl": 50, "diversification": 40, "tradeCount": 4, "flaggedTrades": 2, "enoughTrades": True}
EVENTS = [
    {"pattern_type": "panic_sell", "severity": "medium", "symbol": "TSLA",
     "facts": {"price": 180.5, "fiveDayReturn": -12.4, "avgCost": 200, "vsCostPct": -9.75}, "created_at": "2026-10-02T10:00:00Z"},
    {"pattern_type": "fomo_buy", "severity": "high", "symbol": "NVDA",
     "facts": {"price": 140, "week52High": 141, "percentFromHigh": 0.71, "fiveDayReturn": 16.2}, "created_at": "2026-10-01T10:00:00Z"},
]
BODY = {"scores": SCORES, "counts": {"panic_sell": 1, "fomo_buy": 1, "overconcentration": 0},
        "largest_position": {"symbol": "NVDA", "percent": 60.0}, "events": EVENTS}
COACHING = BehaviorCoaching(headline="You sell into drops", insight="You sold TSLA after a 12.4% drop.", suggestion="Wait a day.")


class FakeMessages:
    """Stands in for client.beta.messages and records each request."""

    def __init__(self, result: Any = None, error: Exception | None = None) -> None:
        self.result, self.error, self.calls = result, error, []

    def parse(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


def make_llm(messages: FakeMessages | None) -> LLMService:
    llm = LLMService(get_settings(), client=SimpleNamespace(beta=SimpleNamespace(messages=messages)) if messages else None)
    if messages is None:
        llm._client = None
    return llm


@pytest.fixture
def store() -> PatternStore:
    return PatternStore(mongomock.MongoClient(tz_aware=True)["niveshpath"])


def client_for(llm: LLMService, store: PatternStore | None) -> TestClient:
    main.app.dependency_overrides[main.get_llm_service] = lambda: llm
    main.app.dependency_overrides[main.get_pattern_store] = lambda: store
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_overrides() -> Any:
    yield
    main.app.dependency_overrides.clear()


def test_claude_coaches_from_the_users_own_facts(store: PatternStore) -> None:
    fake = FakeMessages(SimpleNamespace(stop_reason="end_turn", parsed_output=COACHING, model="claude-opus-5-5"))
    resp = client_for(make_llm(fake), store).post("/api/ai/behavior/u1", json=BODY)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ai_generated"] is True and body["model"] == "claude-opus-5-5"
    assert body["headline"] == COACHING.headline
    request = fake.calls[0]
    assert request["output_format"] is BehaviorCoaching
    prompt = request["messages"][0]["content"]
    # The numbers are passed in, computed by code; the model is told not to recalculate them.
    assert "TSLA" in prompt and "-12.4%" in prompt and "0.71%" in prompt and "Impulse control score: 50" in prompt
    assert "never recalculate" in request["system"]


def test_nothing_to_analyse_does_not_call_claude(store: PatternStore) -> None:
    fake = FakeMessages(SimpleNamespace(stop_reason="end_turn", parsed_output=COACHING, model="x"))
    empty = {**BODY, "events": [], "counts": {"panic_sell": 0, "fomo_buy": 0, "overconcentration": 0}}
    body = client_for(make_llm(fake), store).post("/api/ai/behavior/u1", json=empty).json()
    assert fake.calls == []
    assert body["ai_generated"] is False and "No risky habits" in body["headline"]


def test_api_error_falls_back_to_rules_without_a_500(store: PatternStore) -> None:
    error = anthropic.APIConnectionError(request=httpx.Request("POST", "https://api.anthropic.com/v1/messages"))
    resp = client_for(make_llm(FakeMessages(error=error)), store).post("/api/ai/behavior/u1", json=BODY)
    assert resp.status_code == 200
    assert resp.json()["ai_generated"] is False


def test_no_api_key_uses_rule_based_coaching(store: PatternStore) -> None:
    body = client_for(make_llm(None), store).post("/api/ai/behavior/u1", json=BODY).json()
    assert body["ai_generated"] is False
    assert "TSLA" in body["insight"] or "NVDA" in body["insight"]


def test_result_is_saved_and_returned_later_per_user(store: PatternStore) -> None:
    client = client_for(make_llm(None), store)
    assert client.get("/api/ai/behavior/u1").status_code == 404
    saved = client.post("/api/ai/behavior/u1", json=BODY).json()
    assert client.get("/api/ai/behavior/u1").json()["insight"] == saved["insight"]
    assert client.get("/api/ai/behavior/u2").status_code == 404
    assert store.get("u1", "panic_sell")["count"] == 1


def test_deleting_memory_also_forgets_behavior_results(store: PatternStore) -> None:
    client = client_for(make_llm(None), store)
    client.post("/api/ai/behavior/u1", json=BODY)
    client.post("/api/ai/behavior/u2", json=BODY)
    assert client.delete("/api/ai/memory/u1").status_code == 200
    assert client.get("/api/ai/behavior/u1").status_code == 404
    assert client.get("/api/ai/behavior/u2").status_code == 200


def test_rejects_unknown_pattern_types(store: PatternStore) -> None:
    bad = {**BODY, "events": [{**EVENTS[0], "pattern_type": "yolo"}]}
    assert client_for(make_llm(None), store).post("/api/ai/behavior/u1", json=bad).status_code == 422


def test_rule_based_coaching_names_the_most_common_pattern() -> None:
    req = BehaviorRequest(**{**BODY, "counts": {"panic_sell": 3, "fomo_buy": 1, "overconcentration": 0}})
    coaching = rule_based_coaching(req)
    assert "sell after sharp drops" in coaching.headline
    assert describe_event(BehaviorEvent(**EVENTS[0])).startswith("Sold TSLA at $180.5 after a -12.4% 5-day move (-9.75% vs your average cost)")

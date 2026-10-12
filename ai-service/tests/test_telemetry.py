"""Observability tests (Phase 3, PR C): telemetry is off by default, spans and logs are scrubbed before they leave
the service, and every Claude call records its latency and token counts."""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from typing import Any

import pytest
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import InMemoryMetricReader
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter

import telemetry
from config import get_settings
from schemas import AIInsight, Holding
from services.llm_service import LLMService
from services.portfolio_analytics import compute_metrics


def test_off_without_an_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    assert telemetry.enabled() is False
    assert telemetry.setup(object()) is False


def test_strings_lose_tokens_keys_passwords_and_emails() -> None:
    assert telemetry.redact_string("https://api.x.io/v1?symbol=A&token=SECRET") == "https://api.x.io/v1?symbol=A&token=[REDACTED]"
    assert telemetry.redact_string("Bearer abc.def.ghi") == "Bearer [REDACTED]"
    assert telemetry.redact_string("mongodb+srv://u:TEST_PASSWORD@c.mongodb.net/db") == "mongodb+srv://u:[REDACTED]@c.mongodb.net/db"
    assert telemetry.redact_string("hi sumit@example.com") == "hi [email]"
    assert telemetry.redact_attributes({"http.request.header.x-internal-token": "t", "user.email": "a@b.co", "http.route": "/x"}) == {"http.route": "/x"}


def test_real_spans_are_scrubbed_and_keep_their_trace_id() -> None:
    memory = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(SimpleSpanProcessor(telemetry.RedactingSpanExporter(memory)))  # type: ignore[arg-type]
    tracer = provider.get_tracer("t")
    with tracer.start_as_current_span(
        "POST anthropic", attributes={"url.full": "https://x.io/?token=SECRET", "http.request.header.authorization": "Bearer k"}
    ) as span:
        span.add_event("exception", {"exception.message": "failed for bob@corp.com with Bearer abc"})
        trace_id = span.get_span_context().trace_id
    (out,) = memory.get_finished_spans()
    dumped = json.dumps({"a": dict(out.attributes or {}), "e": [dict(e.attributes or {}) for e in out.events]})
    assert "SECRET" not in dumped and "bob@corp.com" not in dumped and "Bearer abc" not in dumped
    assert "http.request.header.authorization" not in (out.attributes or {})
    assert out.context.trace_id == trace_id
    provider.shutdown()


def test_json_logs_carry_the_trace_id_and_are_scrubbed() -> None:
    provider = TracerProvider()
    formatter = telemetry.JsonFormatter()
    record = logging.LogRecord("ai", logging.WARNING, __file__, 1, "rebuild failed for %s", ("x@y.io",), None)
    with provider.get_tracer("t").start_as_current_span("rebuild") as span:
        line = json.loads(formatter.format(record))
        expected = format(span.get_span_context().trace_id, "032x")
    assert line["trace_id"] == expected
    assert line["msg"] == "rebuild failed for [email]"
    assert line["level"] == "warning"


@pytest.fixture
def meter(monkeypatch: pytest.MonkeyPatch) -> Any:
    reader = InMemoryMetricReader()
    provider = MeterProvider(metric_readers=[reader])
    monkeypatch.setattr(telemetry.metrics, "get_meter", provider.get_meter)
    telemetry._instruments.clear()
    yield reader
    telemetry._instruments.clear()
    provider.shutdown()


def points(reader: InMemoryMetricReader) -> dict[str, list[Any]]:
    data = reader.get_metrics_data()
    out: dict[str, list[Any]] = {}
    for rm in data.resource_metrics if data else []:
        for sm in rm.scope_metrics:
            for m in sm.metrics:
                out[m.name] = list(m.data.data_points)
    return out


def test_a_claude_call_records_latency_and_tokens(meter: Any) -> None:
    insight = AIInsight(summary="s", risk_level="low", diversification_score=80, strengths=[], risks=[], recommendations=[], answer=None)

    def parse(**_: Any) -> Any:
        return SimpleNamespace(stop_reason="end_turn", parsed_output=insight, model="claude-test", usage=SimpleNamespace(input_tokens=1200, output_tokens=345))

    llm = LLMService(get_settings(), client=SimpleNamespace(beta=SimpleNamespace(messages=SimpleNamespace(parse=parse))))
    metrics = compute_metrics([Holding(symbol="AAPL", quantity=2, avg_price=100, current_price=110)], 500.0)
    llm.generate_insight(metrics, [], "moderate", None)
    got = points(meter)
    tokens = {p.attributes["direction"]: p.value for p in got["nivesh.ai.llm.tokens"]}
    assert tokens == {"input": 1200, "output": 345}
    (duration,) = got["nivesh.ai.llm.duration"]
    assert duration.attributes == {"model": "claude-test", "outcome": "end_turn"}
    assert duration.count == 1

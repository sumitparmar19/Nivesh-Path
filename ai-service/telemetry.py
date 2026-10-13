"""OpenTelemetry for the AI service: traces, metrics and logs over OTLP (Grafana Cloud in production).

Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set; then FastAPI, httpx (the Anthropic SDK, the web service's
/internal API) and pymongo are instrumented. The incoming `traceparent` header from the Node web service joins
both services into one trace. Every span is scrubbed before export (credential attributes dropped; emails,
bearer tokens, ?token= and connection-string passwords replaced), and request bodies are never recorded.
Claude call latency and token counts are recorded as metrics (`record_llm_call`). Logs are JSON lines with the
trace id either way.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Sequence
from typing import Any

from opentelemetry import metrics, trace

SECRET_KEY_RE = re.compile(
    r"authorization|cookie|x[-_]internal[-_]token|idempotency[-_]key|password|secret|api[-_]?key|jwt|session|email", re.I
)
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
BEARER_RE = re.compile(r"\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+", re.I)
SECRET_PARAM_RE = re.compile(r"([?&](?:token|apikey|api_key|key|access_token|password|secret)=)[^&#\s]*", re.I)
CREDS_RE = re.compile(r"((?:mongodb(?:\+srv)?|postgres(?:ql)?)://[^:/@\s]+:)[^@\s]+@", re.I)
REDACTED = "[REDACTED]"


def enabled() -> bool:
    """True when an OTLP endpoint is configured (and the SDK isn't explicitly disabled)."""
    return bool(os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")) and os.getenv("OTEL_SDK_DISABLED", "").lower() != "true"


def redact_string(value: str) -> str:
    """Remove bearer tokens, secret query parameters, connection-string passwords and emails from a string."""
    value = BEARER_RE.sub(lambda m: f"{m.group(1)} {REDACTED}", value)
    value = SECRET_PARAM_RE.sub(lambda m: f"{m.group(1)}{REDACTED}", value)
    value = CREDS_RE.sub(lambda m: f"{m.group(1)}{REDACTED}@", value)
    return EMAIL_RE.sub("[email]", value)


def redact_attributes(attributes: Any) -> dict[str, Any]:
    """A copy of span/log attributes without credential keys and with every string value scrubbed."""
    out: dict[str, Any] = {}
    for key, value in dict(attributes or {}).items():
        if SECRET_KEY_RE.search(key):
            continue
        if isinstance(value, str):
            out[key] = redact_string(value)
        elif isinstance(value, (list, tuple)):
            out[key] = tuple(redact_string(v) if isinstance(v, str) else v for v in value)
        else:
            out[key] = value
    return out


class RedactingSpanExporter:
    """Wraps a span exporter so every span is scrubbed (attributes, events, status) before it leaves the process."""

    def __init__(self, inner: Any) -> None:
        self._inner = inner

    @staticmethod
    def scrub(span: Any) -> Any:
        """A copy of one finished span with redacted attributes, event attributes and status message."""
        from opentelemetry.sdk.trace import Event, ReadableSpan
        from opentelemetry.trace import Status

        events = [Event(e.name, redact_attributes(e.attributes), e.timestamp) for e in span.events]
        status = span.status
        if status and status.description:
            status = Status(status.status_code, redact_string(status.description))
        return ReadableSpan(
            name=span.name,
            context=span.context,
            parent=span.parent,
            resource=span.resource,
            attributes=redact_attributes(span.attributes),
            events=events,
            links=span.links,
            kind=span.kind,
            status=status,
            start_time=span.start_time,
            end_time=span.end_time,
            instrumentation_scope=span.instrumentation_scope,
        )

    def export(self, spans: Sequence[Any]) -> Any:
        """Scrub, then hand to the real exporter."""
        return self._inner.export([self.scrub(s) for s in spans])

    def shutdown(self) -> None:
        """Stop the wrapped exporter."""
        self._inner.shutdown()

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        """Flush the wrapped exporter."""
        return bool(self._inner.force_flush(timeout_millis))


class JsonFormatter(logging.Formatter):
    """One JSON object per log line, with the trace id when there is an active span. Messages are scrubbed."""

    def format(self, record: logging.LogRecord) -> str:
        ctx = trace.get_current_span().get_span_context()
        entry: dict[str, Any] = {
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": redact_string(record.getMessage()),
            "service": service_name(),
        }
        if ctx.is_valid:
            entry["trace_id"] = format(ctx.trace_id, "032x")
            entry["span_id"] = format(ctx.span_id, "016x")
        if record.exc_info:
            entry["error"] = redact_string(self.formatException(record.exc_info))
        return json.dumps(entry)


def configure_logging(level: int = logging.INFO) -> None:
    """JSON logs on stdout for every logger (uvicorn's included)."""
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    # One line per outgoing request (with user ids in URLs) is noise.
    logging.getLogger("httpx").setLevel(logging.WARNING)


_instruments: dict[str, Any] = {}


def _instrument(name: str) -> Any:
    # Created lazily so they bind to the real MeterProvider once setup() has installed it.
    if not _instruments:
        meter = metrics.get_meter("nivesh-ai")
        _instruments["llm_duration"] = meter.create_histogram(
            "nivesh.ai.llm.duration", unit="s", description="Claude API call duration",
            explicit_bucket_boundaries_advisory=[0.5, 1, 2.5, 5, 10, 20, 40, 60, 120],
        )
        _instruments["llm_tokens"] = meter.create_counter(
            "nivesh.ai.llm.tokens", unit="{token}", description="Claude tokens used, by direction"
        )
    return _instruments[name]


def record_llm_call(model: str, seconds: float, outcome: str, input_tokens: int = 0, output_tokens: int = 0) -> None:
    """Record one Claude call: latency by outcome, and tokens in/out by model. No-op when telemetry is off."""
    _instrument("llm_duration").record(seconds, {"model": model, "outcome": outcome})
    if input_tokens:
        _instrument("llm_tokens").add(input_tokens, {"model": model, "direction": "input"})
    if output_tokens:
        _instrument("llm_tokens").add(output_tokens, {"model": model, "direction": "output"})


_providers: list[Any] = []


def log_provider(resource: Any) -> Any:
    """A LoggerProvider that batches log records to the OTLP endpoint (OTEL_EXPORTER_OTLP_ENDPOINT + /v1/logs).

    Kept separate so a test can send a real batch through exactly what setup() uses
    (tests/test_telemetry.py::test_a_real_log_batch_reaches_the_otlp_endpoint).
    """
    from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
    from opentelemetry.sdk._logs import LoggerProvider
    from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

    provider = LoggerProvider(resource=resource)
    provider.add_log_record_processor(BatchLogRecordProcessor(OTLPLogExporter()))
    return provider


def service_name() -> str:
    """The name Grafana groups this service under (a copied OTEL_SERVICE_NAME once made it report as nivesh-web)."""
    return os.getenv("OTEL_SERVICE_NAME", "nivesh-ai")


def startup_line() -> str:
    """The start-up log line, with the service name so a wrong OTEL_SERVICE_NAME shows in the console."""
    if enabled():
        return f"Telemetry: exporting over OTLP as {service_name()}"
    return "Telemetry: off (OTEL_EXPORTER_OTLP_ENDPOINT not set)"


def setup(app: Any) -> bool:
    """Install exporters and instrument the FastAPI app, httpx and pymongo. Returns whether telemetry is on.

    Never raises: a telemetry problem must not stop the AI service from starting.
    """
    if not enabled():
        return False
    try:
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.pymongo import PymongoInstrumentor
        from opentelemetry.sdk._logs import LoggingHandler
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {"service.name": service_name(), "service.namespace": "nivesh-path"}
        )
        tracer_provider = TracerProvider(resource=resource)
        tracer_provider.add_span_processor(BatchSpanProcessor(RedactingSpanExporter(OTLPSpanExporter())))  # type: ignore[arg-type]
        trace.set_tracer_provider(tracer_provider)

        meter_provider = MeterProvider(
            resource=resource,
            metric_readers=[PeriodicExportingMetricReader(OTLPMetricExporter(), export_interval_millis=30000)],
        )
        metrics.set_meter_provider(meter_provider)
        _instruments.clear()

        logger_provider = log_provider(resource)
        set_logger_provider(logger_provider)
        logging.getLogger().addHandler(LoggingHandler(level=logging.INFO, logger_provider=logger_provider))

        FastAPIInstrumentor.instrument_app(app, excluded_urls="health")
        HTTPXClientInstrumentor().instrument()
        PymongoInstrumentor().instrument(capture_statement=False)
        _providers.extend([tracer_provider, meter_provider, logger_provider])
        logging.getLogger(__name__).info(startup_line())
        return True
    except Exception:  # noqa: BLE001 - telemetry must never take the service down
        logging.getLogger(__name__).exception("OpenTelemetry disabled after a setup error")
        return False


def shutdown() -> None:
    """Flush and stop the exporters."""
    for provider in _providers:
        try:
            provider.shutdown()
        except Exception:  # noqa: BLE001
            pass

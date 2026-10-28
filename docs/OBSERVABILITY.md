# Observability: OpenTelemetry → Grafana Cloud

Both services send **traces, metrics and logs** over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and do nothing at all when it isn't (tests, local dev).

- Code: `src/telemetry.js`, `src/lib/metrics.js`, `src/lib/logger.js`, `src/lib/redact.js` (web); `ai-service/telemetry.py` (AI).
- Dashboard: `observability/grafana-dashboard.json`.
- Alerts: `observability/alert-rules.yaml`.

## 1. Setting it up
The Grafana Cloud account, the four `OTEL_*` variables per component, the dashboard import, the alert rules and the
alert test are step by step in [`RUNBOOK.md`](RUNBOOK.md) §3.

## 2. What is measured

**Traces.**
- Web: incoming HTTP (Express routes), Prisma/Postgres, MongoDB, Redis, and outgoing fetch (Finnhub, the AI service, Resend email).
- AI service: FastAPI, httpx (the Anthropic API, the web service's `/internal` API) and pymongo.
- The web service sends the W3C `traceparent` header, so **one trade is one trace across both services**. Health checks and static files aren't traced.

**Metrics.** Prometheus names as they appear in Grafana Cloud. The service shows up as `job="nivesh-path/nivesh-web"` (or `/nivesh-ai`).

| Metric | Labels | Meaning |
|---|---|---|
| `nivesh_http_server_duration_seconds` (histogram) | `http_route`, `http_request_method`, `http_response_status_class` | every request; request rate, error rate and p50/p95/p99 come from it |
| `nivesh_trades_total` | `side`, `outcome` (`filled` / `replayed`) | orders placed |
| `nivesh_behavior_detections_total` | `pattern_type`, `severity` | Behavioral Mirror detections (after trades and from price moves) |
| `nivesh_cache_requests_total` | `cache` (`quote`, `metrics`, `profile`…), `result` (`hit`/`miss`) | cache hit rate |
| `nivesh_ai_request_duration_seconds` | `operation`, `outcome` | web → AI service calls (user ids replaced by `:userId`) |
| `nivesh_ai_service_up` | – | 1 if the AI service answers its health check (checked every 60 s), else 0 |
| `nivesh_ai_llm_duration_seconds` | `model`, `outcome` | Claude API call time |
| `nivesh_ai_llm_tokens_total` | `model`, `direction` (`input`/`output`) | Claude tokens used |

**Logs.**
- One JSON line per API request: method, route template, status, ms.
- Every warning and error.
- Each line has `trace_id`/`span_id`, so a log line leads to its trace.
- Logs are also exported to Grafana (Loki).
- Bodies are never logged.

## 3. Privacy: what never leaves the services
- Every span goes through a **redacting exporter** before export:
  - Attributes whose names mention authorization, cookie, `x-internal-token`, idempotency key, password, secret, api key, jwt, session or email are dropped.
  - In every remaining value, emails become `[email]`, `Bearer …` becomes `Bearer [REDACTED]`, `?token=…` becomes `?token=[REDACTED]` (Finnhub puts its API key there), and connection-string passwords are removed.
- Log messages pass through the same scrubber. The logger also censors known secret fields.
- MongoDB queries are recorded with `?` in place of values. Prisma records parameterized SQL (`$1`).
- Request and response bodies are never recorded.
- Tests check all of this on real spans and logs (`tests/telemetry.test.js`, `ai-service/tests/test_telemetry.py`). Removing the redaction makes them fail.
- User ids (24-character MongoDB ids) appear in some URLs, such as `/api/ai/memory/<id>`. They are pseudonymous ids, not personal data.

## 4. Alerts

Three Grafana-managed rules (folder `Nivesh-Path`, evaluation group `nivesh-path`, every 1m). How to create and test them: [`RUNBOOK.md`](RUNBOOK.md) §3.1.

| Name | Query | Threshold | Pending | No data → |
|---|---|---|---|---|
| Web: 5xx error rate above 2% | `100 * (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web",http_response_status_class="5xx"}[5m])) or vector(0)) / clamp_min(sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])), 1e-9) and on() (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])) > 0.05)` | IS ABOVE 2 | 5m | OK |
| Web: p95 latency above 1.5 s | `histogram_quantile(0.95, sum by (le) (rate(nivesh_http_server_duration_seconds_bucket{job=~".*nivesh-web"}[5m]))) and on() (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])) > 0.05)` | IS ABOVE 1.5 | 10m | OK |
| AI service health check failing | `max(nivesh_ai_service_up{job=~".*nivesh-web"})` | IS BELOW 1 | 5m | Alerting |

- `> 0.05` means "only when there are at least 3 requests a minute". A quiet site can't trigger the error or latency alert, for example on the first request after Neon wakes up.
- The same rules are in `observability/alert-rules.yaml` (provisioning format).

**Tested live:** the p95 rule was lowered to fire, the email arrived, and it resolved after being put back ([`RESULTS.md`](RESULTS.md) §5).

## 5. Verified locally
- **One joined trace per trade.** Run with both services sending to a local Jaeger 1.62 (OTLP), on the Postgres ledger.
  - A trade produced one trace with 94 spans across `nivesh-web` and `nivesh-ai`: the Express route, the Prisma transaction (`SELECT … FOR UPDATE`, insert, update), MongoDB, and the AI service's `POST /api/ai/transactions`.
  - An Advisor request also produced one joined trace.
  - The trace id in the web's JSON log line for that trade matched the trace.
- **No leaks.** Every exported span and both log files were searched for the test user's email, password, JWT, internal token and order key. None appeared.
- **Dashboard and alert queries.** The app's metrics were fed to Prometheus 3.5's OTLP receiver (same naming as Grafana Cloud), and every dashboard query and all three alert queries were run against it.
  - All are valid and return data, except the Claude metrics, which need a real API key.
  - Two dashboard queries were broken and are now fixed: a `clamp_min` applied to a scalar, and a 5xx stat that showed "No data" instead of 0.
- **AI-down signal.** After stopping the AI service, `nivesh_ai_service_up` went from 1 to 0 within 40 s.
- **Memory cost on the web service.** Resident memory after 400 requests plus one metric export, two runs each, telemetry **off: 104 MB / 104 MB**; **on: 111 MB / 112 MB**. That's about **+8 MB**, well below the 40–60 MB expected from the full auto-instrumentation bundle, because only the instrumentations the app uses are loaded and there is no gRPC.
- **Shutdown.** It flushes the exporters: SIGTERM to exit took 1.8 s.

## 5b. Fixed after going live: log export (Oct 12, 2026)
- **Symptom on the live web service:** after almost every burst of requests, `TypeError: Cannot read properties of undefined (reading 'export')` from `BatchLogRecordProcessorBase`. Traces and metrics were fine; **no log line reached Grafana**.
- **Cause:** `@opentelemetry/sdk-logs` 0.2xx builds its batch processor from an options object (`{ exporter }`). `src/telemetry.js` passed the exporter itself, so the processor's exporter was `undefined`.
- **Why the tests missed it:** they checked scrubbing on in-memory spans and logs, but never pushed a log batch through the real processor and exporter.
- **Fix:** `new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })`.
- **New tests:**
  - **Node:** `tests/telemetryLogExport.test.js` sends a real batch from a child `node` process (as in production) to a local OTLP receiver. It checks that a direct log record and a line from the app's pino logger both arrive, with the email already scrubbed, and that no export error occurs. With the old line it fails with the exact live error.
  - **AI service:** its log pipeline was already correct. `test_a_real_log_batch_reaches_the_otlp_endpoint` now proves it with a real HTTP receiver.

## 5c. Troubleshooting
A joined trace that shows **Services 1** instead of 2 almost always means both components export under the same
`OTEL_SERVICE_NAME`. Both services log the name at start-up (`Telemetry: exporting over OTLP as nivesh-web` /
`… as nivesh-ai`). The checklist is in [`RUNBOOK.md`](RUNBOOK.md) §3.2.

## 6. Limits
- **Checked live on Oct 12, 2026.** Traces, metrics and logs arrive, the dashboard is imported, a joined trace shows both services, and the p95 alert test fired an email ([`RESULTS.md`](RESULTS.md) §5).
- **New counter series may read 0 on the dashboard.** Prometheus `increase()`/`rate()` ignore a brand-new counter series' first value, so the very first detection of a new type can be missing from a panel until it happens again.
- **Prisma traces are detailed** (about 90 spans per Postgres trade). That's fine for the free tier (50 GB of traces a month). If it ever gets noisy, the Prisma instrumentation can be limited.
- **Metrics are exported every 30 s**, so dashboard panels and alerts lag by up to about 30 s.
- **Neon's free plan sleeps after 5 idle minutes.** The first query afterwards is slower. The minimum-traffic condition keeps that out of the alerts, but a single wake-up still shows on the latency panel.

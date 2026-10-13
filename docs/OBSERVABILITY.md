# Observability: OpenTelemetry → Grafana Cloud

Both services send **traces, metrics and logs** over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set, and do nothing at all when it isn't (tests, local dev).

- Code: `src/telemetry.js`, `src/lib/metrics.js`, `src/lib/logger.js`, `src/lib/redact.js` (web); `ai-service/telemetry.py` (AI).
- Dashboard: `observability/grafana-dashboard.json`.
- Alerts: `observability/alert-rules.yaml`.

## 1. Set it up (Sumit, all in a browser)

1. **Create a Grafana Cloud account:** grafana.com → **Create free account** → choose a stack name (e.g. `niveshpath`) and a region (**US East** is closest to DigitalOcean NYC).
2. **Get the OTLP values:**
   - Stack home → **Connections → Add new connection** → search **OpenTelemetry (OTLP)** → open it.
   - Under "Choose your instrumentation method", pick **OpenTelemetry SDK**, then any language (the values are the same).
   - Click **Create token**, name it `nivesh-path`, and create it.
   - The page now shows environment variables. Copy two of them:
     - `OTEL_EXPORTER_OTLP_ENDPOINT`, e.g. `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`;
     - `OTEL_EXPORTER_OTLP_HEADERS`, which starts `Authorization=Basic%20...`. This one is a secret.
3. **Add the variables in DigitalOcean:** your app → Settings → each component → Environment Variables. Tick **Encrypt** for the headers.

   | Variable | web | ai |
   |---|---|---|
   | `OTEL_EXPORTER_OTLP_ENDPOINT` | the endpoint from step 2 | same |
   | `OTEL_EXPORTER_OTLP_HEADERS` | the headers from step 2 (Encrypt) | same (Encrypt) |
   | `OTEL_SERVICE_NAME` | `nivesh-web` | `nivesh-ai` |
   | `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=production` | same |

   Save. DigitalOcean redeploys both components. The web log then shows `Telemetry: exporting over OTLP`.
4. **Import the dashboard:**
   - Grafana → **Dashboards → New → Import**.
   - Upload `observability/grafana-dashboard.json`. Download it from GitHub: open the file → **Download raw file**.
   - For "Prometheus (Grafana Cloud metrics)", pick the data source named `grafanacloud-<stack>-prom`.
   - Click **Import**. Data appears after the first trades, within about 1 minute.
5. **Create the three alerts** (§4), and an email **contact point**: Alerting → Contact points → **+ Add contact point** → Integration **Email** → your address → Save.
6. **Check the joined trace:**
   - Make a trade on the live site.
   - In Grafana, go to **Explore** → choose the data source ending in `-traces` (Tempo) → **Search** → Service name `nivesh-web` → Span name `POST /api/trades` (or `/api/store-purchase`) → open the newest trace.
   - It should show the web request, the Postgres (Prisma) or MongoDB queries, and a span from **nivesh-ai** (`POST /api/ai/transactions`) in the same trace.

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

Create each in Grafana: **Alerting → Alert rules → + New alert rule**.
1. **Enter the alert rule name.**
2. **Define query:** choose the Prometheus data source, switch the editor to **Code**, and paste the query.
3. **Expressions:** keep "Reduce: Last" and set the **Threshold** as below.
4. **Folder:** `Nivesh-Path`.
5. **Evaluation group:** `nivesh-path`, every **1m**.
6. **Pending period:** as below.
7. **Contact point:** your email.

| Name | Query | Threshold | Pending | No data → |
|---|---|---|---|---|
| Web: 5xx error rate above 2% | `100 * (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web",http_response_status_class="5xx"}[5m])) or vector(0)) / clamp_min(sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])), 1e-9) and on() (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])) > 0.05)` | IS ABOVE 2 | 5m | OK |
| Web: p95 latency above 1.5 s | `histogram_quantile(0.95, sum by (le) (rate(nivesh_http_server_duration_seconds_bucket{job=~".*nivesh-web"}[5m]))) and on() (sum(rate(nivesh_http_server_duration_seconds_count{job=~".*nivesh-web"}[5m])) > 0.05)` | IS ABOVE 1.5 | 10m | OK |
| AI service health check failing | `max(nivesh_ai_service_up{job=~".*nivesh-web"})` | IS BELOW 1 | 5m | Alerting |

- `> 0.05` means "only when there are at least 3 requests a minute". A quiet site can't trigger the error or latency alert, for example on the first request after Neon wakes up.
- The same rules are in `observability/alert-rules.yaml` (provisioning format).

**Test one alert (required once):**
1. Edit "Web: p95 latency above 1.5 s".
2. Change the threshold to **0.001** and the pending period to **1m**. Save.
3. Use the site for a minute: open a few stock pages.
4. Within about 2–3 minutes the rule shows **Firing** and the email arrives.
5. Put back **1.5** and **10m**. Save.
6. The rule returns to **Normal** and you get a "Resolved" email.
7. Take a screenshot of the firing rule for the report.

## 5. Verified locally (before any of your accounts existed)
- **One joined trace per trade.** Run with both services sending to a local Jaeger 1.62 (OTLP), on the Postgres ledger.
  - A trade produced one trace with 94 spans across `nivesh-web` and `nivesh-ai`: the Express route, the Prisma transaction (`SELECT … FOR UPDATE`, insert, update), MongoDB, and the AI service's `POST /api/ai/transactions`.
  - An Advisor request also produced one joined trace.
  - The trace id in the web's JSON log line for that trade matched the trace.
- **No leaks.** I searched every exported span and both log files for the test user's email, password, JWT, internal token and order key. None appeared.
- **Dashboard and alert queries.** I fed the app's metrics to Prometheus 3.5's OTLP receiver (same naming as Grafana Cloud) and ran every dashboard query and all three alert queries.
  - All are valid and return data, except the Claude metrics, which need a real API key.
  - Two dashboard queries were broken and are now fixed: a `clamp_min` applied to a scalar, and a 5xx stat that showed "No data" instead of 0.
- **AI-down signal.** After stopping the AI service, `nivesh_ai_service_up` went from 1 to 0 within 40 s.
- **Memory cost on the web service.** Resident memory after 400 requests plus one metric export, two runs each, telemetry **off: 104 MB / 104 MB**; **on: 111 MB / 112 MB**. That's about **+8 MB**, well below the 40–60 MB I estimated in the review, because only the instrumentations the app uses are loaded and there is no gRPC.
- **Shutdown.** It flushes the exporters: SIGTERM to exit took 1.8 s.

## 5b. Fixed after going live: log export (Oct 12, 2026)
- **Symptom on the live web service:** after almost every burst of requests, `TypeError: Cannot read properties of undefined (reading 'export')` from `BatchLogRecordProcessorBase`. Traces and metrics were fine; **no log line reached Grafana**.
- **Cause:** `@opentelemetry/sdk-logs` 0.2xx builds its batch processor from an options object (`{ exporter }`). `src/telemetry.js` passed the exporter itself, so the processor's exporter was `undefined`.
- **Why the tests missed it:** they checked scrubbing on in-memory spans and logs, but never pushed a log batch through the real processor and exporter.
- **Fix:** `new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })`.
- **New tests:**
  - **Node:** `tests/telemetryLogExport.test.js` sends a real batch from a child `node` process (as in production) to a local OTLP receiver. It checks that a direct log record and a line from the app's pino logger both arrive, with the email already scrubbed, and that no export error occurs. With the old line it fails with the exact live error.
  - **AI service:** its log pipeline was already correct. `test_a_real_log_batch_reaches_the_otlp_endpoint` now proves it with a real HTTP receiver.
- **Workaround to undo:** if `OTEL_LOGS_EXPORTER=none` was set on web, delete it after this fix is deployed. Logs then appear in Grafana → Explore → the `…-logs` (Loki) data source, `service_name="nivesh-web"`.

## 5c. Troubleshooting: a joined trace shows "Services 1"
A trade or an `/api/ai/memory` request should give one trace with **Services 2** (`nivesh-web` → `nivesh-ai`). If Tempo shows **Services 1**, both components are probably exporting under the same name.

1. **Check `OTEL_SERVICE_NAME` on each component.** DigitalOcean → the app → **Settings**.
   - Under **web** it must be `nivesh-web`.
   - Under **ai** it must be `nivesh-ai`.
   - Copying the `OTEL_*` variables from web to ai also copies the name. That is what happened on Oct 12, 2026: before about 22:37 PT, ai logs and `nivesh_ai_llm_*` metrics carry `service_name=nivesh-web`.
2. **Read the start-up line.** Both services log the name they export under:
   - `Telemetry: exporting over OTLP as nivesh-web` (web, Runtime Logs);
   - `Telemetry: exporting over OTLP as nivesh-ai` (ai, Runtime Logs).

   If ai says `as nivesh-web`, fix the variable and redeploy.
3. **Console check 1: what does the process see?** In the ai component's Console:
   ```
   printenv OTEL_SERVICE_NAME
   ```
   This prints the name only. Don't print `OTEL_EXPORTER_OTLP_HEADERS`: it holds the token.
4. **Console check 2: can it export at all?** One test span from the ai Console:
   ```
   python -c "from opentelemetry.sdk.trace import TracerProvider; from opentelemetry.sdk.trace.export import SimpleSpanProcessor; from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter; p=TracerProvider(); p.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter())); p.get_tracer('console-test').start_span('console-test').end(); p.shutdown()"
   ```
   - No error means the endpoint and token work. Search Tempo for the `console-test` span.
   - If the span arrives but traces still show one service, the cause is the name (step 1), not the connection.
5. **Pasted commands arrive broken (`^[[200~` at the start).** The DigitalOcean console has bracketed paste on. Type this by hand once per console session, then paste normally:
   ```
   bind 'set enable-bracketed-paste off'
   ```

## 6. Limits
- **Checked live on Oct 12, 2026.** Traces, metrics and logs arrive, the dashboard is imported, and the p95 alert test fired an email (`docs/PHASE3_LIVE_STATUS.md` §6).
- **New counter series may read 0 on the dashboard.** Prometheus `increase()`/`rate()` ignore a brand-new counter series' first value, so the very first detection of a new type can be missing from a panel until it happens again.
- **Prisma traces are detailed** (about 90 spans per Postgres trade). That's fine for the free tier (50 GB of traces a month). If it ever gets noisy, the Prisma instrumentation can be limited.
- **Metrics are exported every 30 s**, so dashboard panels and alerts lag by up to about 30 s.
- **Neon's free plan sleeps after 5 idle minutes.** The first query afterwards is slower. The minimum-traffic condition keeps that out of the alerts, but a single wake-up still shows on the latency panel.

# Phase 3 · PR C+D report: observability (OpenTelemetry → Grafana) and load tests (k6)

**Status:** merged and **exporting from the live site** (Grafana Cloud). One live bug, log export, was found and fixed in the next PR. The dashboard, alerts and the two screenshots are still to do. See §0.

---

## 0. Live result (Oct 12, 2026)

**Set up:**
- A Grafana Cloud stack with OTLP endpoint `https://otlp-gateway-prod-us-east-2.grafana.net/otlp`. us-east-2 is fine.
- Both components have `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` (encrypted, `Basic%20…`), `OTEL_SERVICE_NAME` (`nivesh-web` / `nivesh-ai`) and `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production`.

**Working:**
- The web log shows **`Telemetry: exporting over OTLP`**.
- Request log lines carry `trace_id`/`span_id`.
- Traces and metrics export.

**Bug found live:**
- Every log batch failed with `TypeError: Cannot read properties of undefined (reading 'export')`, so no log line reached Grafana.
- **Cause:** the batch processor was built with the old constructor signature.
- **Fixed** in the follow-up PR (`docs/PHASE3_FIX_LOG_EXPORT_REPORT.md`), with a test that sends a real batch to a local OTLP receiver. On the old code that test fails with the same error.
- If `OTEL_LOGS_EXPORTER=none` was set on web as a workaround, delete it after that fix deploys.

**Security:**
- The first Grafana token appeared in a screenshot.
- A new token (`nivesh-path-2`) replaces it, and the first one is to be deleted. **Confirm both.**

**Still to do (your §1 steps 14–17):**
- import the dashboard;
- create the 3 alerts and the email contact point;
- run the alert test (screenshot);
- the joined trace (screenshot).


## 1. Your steps, in order (all in a browser)

Do PR A's steps first (credential rotation, Neon, token). These can follow any time after this PR is merged.

1. **Grafana Cloud account:** grafana.com → **Create free account** → stack name (e.g. `niveshpath`), region **US East**.
2. **OTLP values:**
   - Stack → **Connections → Add new connection → OpenTelemetry (OTLP)** → method "OpenTelemetry SDK".
   - **Create token** (name `nivesh-path`).
   - Copy `OTEL_EXPORTER_OTLP_ENDPOINT` (looks like `https://otlp-gateway-prod-us-east-0.grafana.net/otlp`) and `OTEL_EXPORTER_OTLP_HEADERS` (starts `Authorization=Basic%20…`, a secret).
3. **DigitalOcean** → app → Settings → **web** and **ai** → Environment Variables:
   - `OTEL_EXPORTER_OTLP_ENDPOINT`: same on both.
   - `OTEL_EXPORTER_OTLP_HEADERS`: same on both, with **Encrypt** ticked.
   - `OTEL_SERVICE_NAME`: `nivesh-web` on web, `nivesh-ai` on ai.
   - `OTEL_RESOURCE_ATTRIBUTES`: `deployment.environment=production` on both.

   Save. After the redeploy, web → Runtime Logs shows `Telemetry: exporting over OTLP`.
4. **Dashboard:** Grafana → Dashboards → New → **Import** → upload `observability/grafana-dashboard.json` (GitHub → the file → Download raw) → pick the `grafanacloud-…-prom` data source → Import.
5. **Alerts:**
   - Alerting → Contact points → + Add → Email → your address.
   - Then create the 3 alert rules with the queries in `docs/OBSERVABILITY.md` §4. That table has the threshold, pending period and "no data" setting for each.
6. **Test one alert:**
   - Set the p95 rule's threshold to `0.001` with pending `1m`, and browse the site for a minute.
   - It turns **Firing** and the email arrives.
   - Put back `1.5` / `10m`. You get "Resolved".
   - Screenshot the firing rule and send it to me.
7. **Joined trace:**
   - Make a trade.
   - Grafana → Explore → the `…-traces` data source → Search → Service `nivesh-web` → Span name `POST /api/trades` → open the newest trace.
   - Check that it includes a `nivesh-ai` span. Screenshot it for the report.
8. **Load test (optional, any time):** GitHub → Actions → **Load test** → Run workflow (inputs: users and duration). The results are in the run summary.

## 2. What changed

**Observability (Part 1, A2)**
- **Web** (`src/telemetry.js`, loaded first by `server.js`):
  - traces for Express routes, Prisma/Postgres, MongoDB, Redis and outgoing fetch (Finnhub, AI service, Resend);
  - metrics and logs over OTLP/HTTP-protobuf;
  - it uses the SDK pieces by hand instead of `sdk-node`, so there are no gRPC exporters.
- **AI service** (`ai-service/telemetry.py`):
  - FastAPI, httpx (Anthropic, `/internal`) and pymongo;
  - Claude latency and token counts (`llm_service.py`).
- **One trace across both services** via W3C `traceparent`.
- **Off by default:** without `OTEL_EXPORTER_OTLP_ENDPOINT` nothing is loaded or exported. `OTEL_{TRACES,METRICS,LOGS}_EXPORTER=none` turns one signal off.
- **Metrics** (`src/lib/metrics.js`):
  - request duration by **route template** (low cardinality);
  - trades (filled/replayed);
  - Behavioral Mirror detections by type;
  - cache hit/miss per cache;
  - web→AI call duration (user ids replaced by `:userId`);
  - `ai_service_up` (polled every 60 s).
- **Logs:** pino JSON on the web side and a JSON formatter on the AI side. Both carry trace ids. `console.*` is gone from server code.
- **Privacy:**
  - A redacting span exporter in both services drops credential attributes and scrubs emails, bearer tokens, `?token=` (Finnhub's key) and connection-string passwords.
  - Logs go through the same scrubber.
  - MongoDB statements are recorded without values. Bodies are never recorded.
- **Dashboard and alerts:** `observability/grafana-dashboard.json` (15 panels) and `observability/alert-rules.yaml` (3 rules). Two of the rules have a minimum-traffic guard, so a quiet site or a Neon wake-up can't page you.
- **Two small fixes:**
  - SIGTERM closes idle keep-alive sockets (exit in 1.8 s, was a 10 s timeout);
  - the start-up clean-up now logs as JSON.

**Load tests (Part 1, A3)**
- **Scripts** in `loadtest/`:
  - `read-mix.js`: Markets quotes, the 4 stock-page calls, portfolio summary and history.
  - `trade-mix.js`: 1-share orders with an Idempotency-Key, then the portfolio.
  - Test users are created by the test on the `.invalid` domain. Claude is never called.
- **Workflow** (`.github/workflows/loadtest.yml`):
  - Runs manually, and on PRs that change the load test.
  - Brings up the full docker-compose stack with fake market data and the Postgres ledger.
  - Runs both mixes with the cache **on**, then again with **`CACHE_DISABLED=1`**, each on fresh databases.
  - The cache hit rate comes from a Prometheus in `docker-compose.loadtest.yml`, which receives the app's own OTLP metrics.
  - Results go to the run summary and the job log; the raw files are uploaded as an artifact.
- **`CACHE_DISABLED=1`** (`src/lib/cache.js`): every lookup misses.
- **What's new:** a new entry, "Watched and load-tested".

**Tests (before → after)**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 170 | 178 | `telemetry.test.js` (7): off by default, scrubbing of strings/attributes/**real spans**, the cache switch, **metrics from real HTTP requests**, AI labels without ids; `loadtestReport.test.js` (1) |
| pytest | 46 | 51 | `test_telemetry.py` (5): off by default, scrubbing, spans keep trace ids, JSON logs with trace id, Claude call → latency + token metrics |
| Vitest | 109 | 109 | (the release-list test covers the new entry) |

No existing test was edited.

## 3. Bugs planted on purpose
- **Turned off the span scrubbing** in the web exporter (`spans.map(scrub)` → `spans`): the real-span redaction test failed. Restored.
- **Turned off the scrubbing** in the Python exporter (`redact_attributes(...)` → raw attributes): `test_real_spans_are_scrubbed…` failed. Restored.
- **Bugs the tests found in my own first draft** (fixed before commit):
  - an attribute named `enduser.email` was scrubbed instead of dropped;
  - routes with aliases (`/api/trades`, `/api/store-purchase`) were labelled with the first alias rather than the path that was called.
- **Bugs that checking the dashboard against real Prometheus found:** an "Error rate" query applied `clamp_min` to a scalar (invalid PromQL), and the "5xx rate" stat showed "No data" instead of 0. Both fixed.

## 4. Real numbers (each with its source)
- **Memory** (`docs/OBSERVABILITY.md` §5): web RSS after 400 requests, telemetry off 104/104 MB vs on 111/112 MB, **about +8 MB**.
- **Joined trace** (§5): 94 spans across both services for one trade.
- **AI-down signal:** flipped to 0 within 40 s.
- **Load test** (`docs/PERFORMANCE.md`, [Load test #4](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38203584203)): 4 vCPU / 15 GB GitHub runner, fake market data, Postgres ledger.
  - **Read mix**, 20 users: about 122 req/s. p50/p95/p99 is **3.2 / 9.6 / 15.2 ms with the cache on** and **5.5 / 22.3 / 37.7 ms with it off**, so p95 is **2.3× slower** without the cache. Cache hit rate **99.7%**.
  - **Trade mix**, 10 users: about 17 req/s. p95 is about 22 ms either way (Postgres transaction-bound).
  - **0 errors** in about 42,000 requests across two runs.
  - Each trade makes about 11 cache lookups. That's why the cache is required with Finnhub's 60-calls-a-minute free plan.

## 5. Limits
- **Not checked live.** I can't reach Grafana Cloud or the live site; steps 4–7 are the live check.
- **Load numbers come from one shared GitHub runner** (k6 and the whole stack share it; size in `docs/PERFORMANCE.md`), with **fake market data**. A real Finnhub call costs far more than the fake in-process one, so the cache-off penalty here is a *lower bound*. See `docs/PERFORMANCE.md`.
- **The load test is closed-loop with 1 s think time,** so requests/s reflects the simulated users, not the server's ceiling. Latency is the meaningful number.
- **Metrics are exported every 30 s** in production, so dashboards and alerts lag by up to 30 s. A brand-new counter series can read 0 on `increase()` panels at first (Prometheus behaviour).
- **Prisma traces are detailed** (about 90 spans per Postgres trade). Fine for the free tier; can be trimmed if needed.
- **Cache hit rate is only measured for the web service's Redis/memory cache.** The AI service has no cache.

## 6. Resume bullets (measured only)
- Instrumented a Node/Express + Python/FastAPI app with OpenTelemetry. One trade is one distributed trace (94 spans across both services, Postgres included), metrics feed a 15-panel Grafana dashboard and 3 alerts, and a redacting exporter is proven by tests to drop tokens, keys and emails. Memory cost measured at about 8 MB per instance.
- Built a k6 load-test pipeline in GitHub Actions that boots the full 6-service stack (web, AI, Postgres, MongoDB, Redis, Prometheus). Measured read-path p95 latency of 9.6 ms with Redis caching vs 22.3 ms without (2.3×) at a 99.7% cache hit rate, and 0 errors across about 42,000 requests including concurrent Postgres-backed orders.

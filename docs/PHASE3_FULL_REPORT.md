# Phase 3 · Part 1 full report: PR A + PR B + PR C+D, for review before merging PR C+D

**For:** Sumit, and the planning chat, to check everything before PR C+D is merged.
**Scope:** all of Phase 3 Part 1:
- A1, move the money ledger to PostgreSQL (PR A, PR B);
- A2, observability (PR C);
- A3, load tests (PR D);
- plus your additions to the "Go" message.

**Repo state:**

| PR | What | State |
|---|---|---|
| PR A ([#12](https://github.com/sumitparmar19/Nivesh-Path/pull/12)) | Postgres ledger foundation + secret scan | **merged** (`4928e7d`) |
| PR B ([#13](https://github.com/sumitparmar19/Nivesh-Path/pull/13)) | the ledger move tool + cutover runbook | **merged** (`37230c1`) |
| PR C+D ([#14](https://github.com/sumitparmar19/Nivesh-Path/pull/14)) | OpenTelemetry → Grafana, k6 load tests | **open**, all 15 checks green, no conflicts, no review comments |

**Live site:** behaves exactly as before.
- **Money:** still on the **MongoDB** ledger, until you run the cutover (your steps 6–10).
- **Monitoring:** off, until you add the Grafana values (your steps 11–13).

**The per-PR reports** (each starts with your steps):
- `docs/PHASE3_PR_A_REPORT.md`
- `docs/PHASE3_PR_B_REPORT.md`
- `docs/PHASE3_PR_CD_REPORT.md`

This file brings all three together. §9 lists every document.

---

## 0. Summary

| | PR A (merged) | PR B (merged) | PR C+D (open, green) |
|---|---|---|---|
| **What** | Postgres ledger next to MongoDB behind a switch; database-enforced money rules; row locks; retry-safe orders; maintenance pause; AI reads trades through Node; secret scan; MIT license | One-time move tool (`--dry-run / --migrate / --verify / --export-since`), cutover runbook, "Money ledger" row on What's new; review fixes (422, no 1970 dates) | OpenTelemetry in both services, redaction, metrics, JSON logs, Grafana dashboard + 3 alerts; k6 read/trade load tests, cache on vs off, run in CI |
| **Size** | 50 files, +2,754 / −196 | 15 files, +773 / −6 | 43 files, +3,188 / −60 |
| **Tests (all suites)** | 279 → 310 | 310 → 327 | 327 → 340 |
| **Live effect** | None until you set variables | None until you run the cutover | None until you add the Grafana variables |

**Test totals across Phase 3 so far:**
- Jest: 132 → **178**
- pytest: 39 → **51**
- Vitest: 106 → **109**
- Playwright: 2 → **2 × 2 ledgers**

**No existing test was edited in any of the three PRs.**

---

## 1. Your steps, all in one place (all in a browser)

Never paste a password, key or connection string into any chat (here or the planning chat). They go only into Atlas, Neon, DigitalOcean, Grafana or GitHub screens.

### Where each value comes from

| Value | Where you get it | Where it goes |
|---|---|---|
| Live cluster user + host (no password) | DigitalOcean → app → Console → web → the `node -e …` line in step 1 | Read only, to decide 1a |
| `nivesh-live` password | Atlas → Database Access → Add user → **Autogenerate** | Inside `MONGO_URL` on **web** and **ai** (DigitalOcean, Encrypt) |
| `nivesh-demo` password | Atlas, the same way | Nowhere yet (AWS Secrets Manager in Part 2) |
| New Finnhub key | finnhub.io → Dashboard | `FINNHUB_API_KEY` on **web** (Encrypt) |
| Neon **pooled** URL (+ `&pgbouncer=true`) | Neon → Connect, pooling **on** | `DATABASE_URL` on web + the `migrate` job (App Spec, `SECRET`) |
| Neon **direct** URL | Neon → Connect, pooling **off** | `DIRECT_URL` on the `migrate` job only (App Spec, `SECRET`) |
| `AI_INTERNAL_TOKEN` | DigitalOcean Console → web → `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Same value on **web** and **ai** (Encrypt) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Grafana Cloud → Connections → OpenTelemetry (OTLP) | **web** and **ai** |
| `OTEL_EXPORTER_OTLP_HEADERS` | Same Grafana page, after **Create token** (starts `Authorization=Basic%20…`) | **web** and **ai** (Encrypt) |

### Part 1 · PR A (merged and deployed; do these now)

Full clicks: `docs/PHASE3_PR_A_REPORT.md` §1.

1. **Rotate the leaked credentials.** The secret scan found them in the repo's first commit.
   - **1a. Check which cluster the live site uses.** Console → web:
     ```
     node -e "const u=new URL(process.env.MONGO_URL); console.log(u.username, u.hostname)"
     ```
     It prints the user and host, never the password. If `niveshpathcluster` isn't in **your** Atlas account, its owner must delete `dhrumil`, and you move to a free cluster in your own account (tell me and I'll write that move up).
   - **1b. In Atlas:**
     - Create `nivesh-live` (`readWrite` on the live database only).
     - Build the new connection string and update `MONGO_URL` on **web** and **ai**.
     - Check that the site works and that 1a now prints `nivesh-live`.
     - **Delete `dhrumil`.**
     - Create `nivesh-demo` (`readWrite` on `niveshpath_demo`).
     - There is **no jobs user** (decided in review, Q1).
   - **1c. Finnhub:** regenerate the key, then update `FINNHUB_API_KEY` on web.
   - **1d. Stripe:** Developers → API keys → **Roll key**. If that account isn't yours, tell its owner.
2. **Neon:** new project `nivesh-path`, Postgres 16, region AWS US East. Copy the pooled URL (add `&pgbouncer=true`) and the direct URL.
3. **`AI_INTERNAL_TOKEN`:** generate it (table above). Put the same value on web and ai.
4. **App Spec editor** (Settings → App Spec → Edit). The exact YAML is in the PR A report, Step 4.
   - On web: `LEDGER_BACKEND=mongo` and `DATABASE_URL` (SECRET).
   - On ai: `WEB_INTERNAL_URL=${web.PRIVATE_URL}`.
   - The `migrate` PRE_DEPLOY job, with `DATABASE_URL` + `DIRECT_URL` (SECRET).
   - Save. The job log must end with `All migrations have been successfully applied.`
5. **Checks:**
   - Console → web → `node scripts/db-check.js` prints `"ok":true` with `20261011225621_ledger_init`, accounts 0, trades 0. **Send me that line** (it has no secrets).
   - What's new shows AI memory rebuild **ok**.
   - Buy 1 share: it fills and the Mirror works.

### Part 2 · PR B: the cutover (merged; after Part 1)

Full runbook: `docs/LEDGER_CUTOVER.md`. About 5 minutes.

6. **Dry run** (changes nothing): Console → web → `node scripts/migrate-ledger.js --dry-run`. **Send me the output** (user ids and amounts only). If it says `BLOCKING problems`, stop and send it.
7. **Pause:** web → add `LEDGER_MAINTENANCE` = `1` → Save → wait for "Deployed".
8. **Copy and check:**
   - Run `node scripts/migrate-ledger.js --migrate`. It must end `Copied. Now run --verify.`
   - Run `--verify`. It must end `All users match (N)`. **Send me the verify output**; it goes on the PR as proof.
   - On `MISMATCH` or `conflict`: delete `LEDGER_MAINTENANCE` (trading reopens on MongoDB, nothing lost) and send me the output.
9. **Switch:** `LEDGER_BACKEND` = `postgres` and **delete** `LEDGER_MAINTENANCE`, in **one** save. **Note the time (UTC).**
10. **Check:**
    - What's new → **Money ledger: PostgreSQL (Neon)**;
    - Portfolio shows the same cash, holdings and history;
    - buy 1 share; the Mirror works;
    - `db-check` shows your counts.

    Rollback = `LEDGER_BACKEND=mongo`, then `--export-since <switch time>`.

### Part 3 · PR C+D: monitoring (after you merge #14; any time, not tied to the cutover)

Full clicks: `docs/OBSERVABILITY.md` §1 and §4.

11. **Grafana Cloud:** grafana.com → Create free account → stack `niveshpath`, region **US East**.
12. **OTLP values:** Connections → Add new connection → **OpenTelemetry (OTLP)** → "OpenTelemetry SDK" → **Create token** `nivesh-path`. Copy the endpoint and the headers.
13. **DigitalOcean**, on both **web** and **ai**:
    - `OTEL_EXPORTER_OTLP_ENDPOINT`: same on both.
    - `OTEL_EXPORTER_OTLP_HEADERS`: same on both, **Encrypt**.
    - `OTEL_SERVICE_NAME`: `nivesh-web` on web, `nivesh-ai` on ai.
    - `OTEL_RESOURCE_ATTRIBUTES`: `deployment.environment=production` on both.

    After the redeploy, web Runtime Logs show `Telemetry: exporting over OTLP`.
14. **Dashboard:** Dashboards → New → Import → upload `observability/grafana-dashboard.json` → pick `grafanacloud-…-prom` → Import.
15. **Alerts:**
    - Add an email contact point.
    - Create the 3 rules. Queries, thresholds, pending periods and "no data" settings are in the `OBSERVABILITY.md` §4 table.
16. **Test one alert:**
    - Set p95 to `0.001` / `1m` and browse for a minute: it shows **Firing** and the email arrives.
    - Put back `1.5` / `10m`: you get "Resolved".
    - **Send me a screenshot of the firing rule.**
17. **Joined trace:** make a trade → Explore → `…-traces` → Search → Service `nivesh-web`, Span `POST /api/trades` → open the newest. Check that it has a `nivesh-ai` span. **Send me a screenshot.**
18. *(Optional)* GitHub → Actions → **Load test** → Run workflow. The results are in the run summary.

### What to send back (and where it goes)

| Item | It proves | Goes into |
|---|---|---|
| `db-check` line (step 5) | migrations applied on Neon | PR A report |
| dry-run output (step 6) | the data can move | PR B report |
| verify output (step 8) + switch time (step 9) | money matches to the cent | PR B report (A1 acceptance) |
| firing-alert screenshot (step 16) | alerting works end to end | PR C+D report (A2 acceptance) |
| joined-trace screenshot (step 17) | one trade = one trace live | PR C+D report (A2 acceptance) |

---

## 2. What you asked for, and where it stands

**Your "Go" message**

| Ask | Status |
|---|---|
| D1–D9 as recommended | Applied where reached: D1 whole shares, D2 maintenance-pause cutover, D3 DigitalOcean pre-deploy migration job, D4 users stay in MongoDB. D5–D9 are for PRs E–I |
| D10 MIT license | `LICENSE` + `package.json` (PR A) |
| 1. gitleaks full-history scan + rotate the Atlas password first | CI job in PR A; rotation is **step 1** above |
| 2. Separate Atlas users per environment | `nivesh-live`, `nivesh-demo` in step 1b. The jobs user was dropped after review (Q1) |
| 3. Merge C+D and H+I; keep A and B separate | Done: A and B were separate; C+D is one PR |
| 4. Keep building while you're blocked | PR B was built while PR A waited; C+D while PR A/B's live steps wait |
| 5. Every report starts with your steps | All three PR reports do, and so does this one |

**Planning-chat review of PR B (all done):**
- Q3: a reused key with a different order → 422 + tests.
- No 1970 dates in the move + test.
- Q1: the nightly job goes through `/internal` only.
- Q2: no copy-back.
- Q4: D-cleanup about a week after the cutover.
- Q5: start C+D.
- The cluster check is step 1a.

**Part 1 acceptance**

| Part | Requirement | Status |
|---|---|---|
| A1 | All tests pass; new tests for constraints, parallel buys, idempotency, migration script, reset/delete, AI rebuild | ✅ in CI |
| A1 | Live: same cash/holdings/history after the move, verify report attached, new trade + Mirror work | ⏳ your steps 6–10 |
| A2 | OpenTelemetry both services, metrics, JSON logs, redaction + test, dashboard, 3 alerts, `OBSERVABILITY.md` | ✅ built; checked locally against Jaeger and Prometheus |
| A2 | Live: one joined trace, dashboard has data, one alert fired and resolved | ⏳ your steps 11–17 |
| A3 | `CACHE_DISABLED`, k6 read + trade mixes, workflow, `PERFORMANCE.md` with the run link | ✅ run in CI ([Load test #4](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38203584203)) |

---

## 3. What I did: PR A (merged)

Details: `docs/PHASE3_AB_FULL_REPORT.md` §3 and `docs/PHASE3_PR_A_REPORT.md` §2.

**Postgres schema** (`prisma/`, migration `20261011225621_ledger_init`):
- `accounts`: cash NUMERIC(14,2).
- `trades`:
  - ids are the same 24-hex ids as in MongoDB, so Mirror events and AI memory keep pointing at the right trade;
  - quantity is a whole-share INTEGER;
  - price is NUMERIC(14,4).
- Database rules:
  - hand-written CHECKs: cash ≥ 0, quantity/price/total > 0, side, ObjectId format;
  - foreign key with cascade;
  - `UNIQUE(user_id, idempotency_key)`.

**One ledger, two stores:**
- `LEDGER_BACKEND=mongo|postgres` picks `ledgerStore.mongo.js` (today's logic, the rollback path) or `ledgerStore.pg.js`.
- In the Postgres store, each order is one transaction with `SELECT … FOR UPDATE` on the account row.
- **Every reader of trades and cash was switched** to the store: routes, Advisor, patterns, account delete, `/api/me`, the detector, the start-up clean-up.

**Retry-safe orders:**
- Both trade UIs send an `Idempotency-Key`, reused only while the *same* order is retried after an unclear failure.
- A replay returns 200 `replayed`, with no second charge.

**`LEDGER_MAINTENANCE=1`:** trades, reset and delete answer 503; reads keep working.

**`/internal/trades*`:**
- token-only (`X-Internal-Token`, constant-time compare); 404 for everything else;
- read-only and rate-limited;
- the AI service reads trades there (`HttpTradeStore`, boot retries).

**Ops:**
- CI: Postgres service, schema-drift check, e2e on **both** ledgers, Docker image migrates and boots on Postgres.
- `docker-compose` Postgres; `.do/app.yaml` migrate job; `scripts/db-check.js`.
- Graceful SIGTERM.

**Security:**
- gitleaks 8.30.1, checksum-pinned, scanning the full history.
- A custom MongoDB rule (the defaults have none).
- `.gitleaksignore` lists only the 5 first-commit findings; any new secret fails CI.

## 4. What I did: PR B (merged)

Details: `docs/PHASE3_PR_B_REPORT.md` §2 and `docs/LEDGER_CUTOVER.md`.

**`scripts/migrate-ledger.js` + `src/lib/ledgerMigration.js`:**
- **`--dry-run`:** lists every rounding change and every blocking problem.
- **`--migrate`:** one transaction per user; keeps trade ids; `Tesla` → `TSLA`.
- **`--verify`:** cash to the cent, the exact trade-id set, holdings and cost basis.
- **`--export-since`:** lists what MongoDB is missing after a rollback.

**Safety rails:**
- repeat-safe;
- refuses a user who already has Postgres-only trades;
- refuses unless `LEDGER_MAINTENANCE=1`;
- refuses while `LEDGER_BACKEND=postgres`;
- MongoDB is only ever read.

**Review changes:**
- 422 "This order key was already used for a different order." (checked once in `ledger.js`, so both stores behave the same).
- A trade with no timestamp gets its id's creation time plus a dry-run note.

**Status and docs:**
- `/api/status` gets `ledger: {backend, tradingPaused}` (no DB call).
- What's new shows "Money ledger".
- Jest runs test files one at a time.

## 5. What I did: PR C+D (open, #14), in detail

### 5.1 Observability, web service
**`src/telemetry.js`** is loaded first by `server.js`.
- **Off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** Without it nothing loads, and every metric or span call is a no-op. Tests and local dev are unaffected.
- **SDK pieces chosen by hand** (no `sdk-node`, no gRPC exporters):
  - tracer, meter and logger providers;
  - OTLP over HTTP/protobuf;
  - instrumentations only for what the app uses: HTTP, Express, MongoDB (values replaced by `?`), Redis, outgoing fetch (Finnhub, AI service, Resend), pino, Prisma.
  - Health checks and static files aren't traced.
- **One trade = one trace across both services:** the W3C `traceparent` header is sent on every web → AI call.
- **Standard switches:** `OTEL_TRACES_EXPORTER` / `OTEL_METRICS_EXPORTER` / `OTEL_LOGS_EXPORTER = none` turn one signal off. `OTEL_METRIC_EXPORT_INTERVAL` defaults to 30 s.
- **Never stops the site:** a telemetry start-up error only logs a line.

**`src/lib/redact.js`**, used by the span exporter and the logger:
- **Attributes dropped by name:** authorization, cookie, `x-internal-token`, idempotency key, password, secret, api key, jwt, session, email.
- **Values scrubbed:**
  - emails → `[email]`;
  - `Bearer …` → `Bearer [REDACTED]`;
  - `?token=…` (Finnhub's key) → `?token=[REDACTED]`;
  - passwords inside MongoDB/Postgres connection strings are removed.
- **Bodies are never recorded.**

**`src/lib/metrics.js`** (instruments are created lazily):

| Metric (as named in Grafana Cloud) | Labels | From |
|---|---|---|
| `nivesh_http_server_duration_seconds` (histogram) | route **template**, method, status class | every request (`httpMetrics` middleware) |
| `nivesh_trades_total` | side, outcome (`filled`/`replayed`) | `routes/purchases.js` |
| `nivesh_behavior_detections_total` | pattern type, severity | `behaviorDetector.js` (after trades and from price moves) |
| `nivesh_cache_requests_total` | cache (`quote`, `metrics`, …), hit/miss | `cache.js` |
| `nivesh_ai_request_duration_seconds` | operation (user ids → `:userId`), outcome | `aiClient.js` |
| `nivesh_ai_service_up` | – | the AI health check, every 60 s |

- **Low cardinality:**
  - routes are templates (`/api/stocks/:symbol/quote`), never raw URLs;
  - an alias is labelled with the path actually called;
  - unknown paths become `/api/(unmatched)`.

**`src/lib/logger.js`** (pino):
- One JSON line per API request: method, route template, status, ms.
- Every log line carries `trace_id`/`span_id`. Logs are exported to Grafana (Loki).
- `console.*` was replaced in server code.
- The logger is silent under tests.

**`src/lib/cache.js`:**
- `CACHE_DISABLED=1` makes every lookup miss (for the "cache off" load test).
- Hit/miss counting per cache.

**`server.js`:**
- The pino logger.
- The AI-up gauge, when telemetry is on.
- On SIGTERM: closes idle keep-alive sockets (exit in **1.8 s**, was a 10 s timeout) and flushes telemetry.
- Sentry is unchanged.

### 5.2 Observability, AI service
**`ai-service/telemetry.py`**, called from `main.py`:
- **Instrumentation:**
  - FastAPI (health excluded);
  - httpx: the Anthropic API and the web `/internal` API;
  - pymongo, with statements not captured.
- **Shared behaviour with the web service:**
  - the same redaction rules (`RedactingSpanExporter`);
  - JSON logs with trace ids;
  - off without the endpoint;
  - never raises.
- **Pinned** to OpenTelemetry 1.45.0 / 0.66b0, the versions ChromaDB's own pin allows.

**`services/llm_service.py`:** Claude call latency and input/output tokens.
- `nivesh_ai_llm_duration_seconds`, labels model and outcome.
- `nivesh_ai_llm_tokens_total`, labels model and direction.

### 5.3 Dashboard and alerts (`observability/`)
**`grafana-dashboard.json`, 15 panels:**
- **Stats:** requests/s, 5xx rate, p95, AI service up.
- **Time series:**
  - request rate by route;
  - error rate;
  - p50/p95/p99;
  - p95 by route;
  - cache hit rate by cache;
  - trades per minute;
  - Mirror detections per hour;
  - web → AI p95;
  - Claude latency;
  - Claude tokens per hour.
- **A note on traces and logs.**
- It imports with a data-source picker, and works whatever the job name prefix is.

**`alert-rules.yaml`, 3 rules:**

| Rule | Threshold | Pending | No data |
|---|---|---|---|
| Web: 5xx error rate | above 2% | 5m | OK |
| Web: p95 latency | above 1.5 s | 10m | OK |
| AI service health check failing | below 1 | 5m | Alerting |

- The two web rules only count when there's real traffic (`> 0.05` req/s, about 3 a minute). A quiet site, or Neon waking up, can't page you.
- **Every dashboard and alert query was run** against Prometheus 3.5 fed by the app's own metrics (the same names Grafana Cloud uses). That caught two broken queries, which are fixed:
  - a `clamp_min` applied to a scalar;
  - a 5xx stat that showed "No data" instead of 0.

### 5.4 Load tests (`loadtest/`, `.github/workflows/loadtest.yml`)
**Mixes:**
- `read-mix.js`, 20 users. Each iteration makes 7 requests:
  - Markets quotes;
  - the stock page's quote, profile, key stats and news;
  - portfolio summary and history.
- `trade-mix.js`, 10 users, each its own account:
  - a 1-share order with an `Idempotency-Key`;
  - then the portfolio summary.

**Test users:** created by the test on the `.invalid` domain. **Claude is never called.**

**The workflow:**
- k6 1.4.0, checksum-pinned.
- Builds the full docker-compose stack with fake market data and the Postgres ledger.
- Runs both mixes with the cache on, then on fresh databases with `CACHE_DISABLED=1`.
- Reads the cache hit rate from a Prometheus in `docker-compose.loadtest.yml`, which receives the app's own metrics.
- Prints the table to the job log and the run summary, and uploads the raw files (90 days).
- Runs on demand, and on PRs that change the load test.

**`docs/PERFORMANCE.md`:** the numbers and the run link (§7 below).

### 5.5 Other
- **What's new:** a new entry, "Watched and load-tested".
- **Config and docs:** `.env.example` (all new variables, explained), `.do/app.yaml` comment, `CLAUDE.md`, plan notes.
- **`.gitleaks.toml`:** now also allows the literal `[REDACTED]` (test expectations), so redacted output isn't flagged. A real-looking planted password is still caught.

---

## 6. Tests, before → after

| Suite | Start of Phase 3 | After A | After B | After C+D | New in C+D |
|---|---|---|---|---|---|
| Jest | 132 | 154 | 170 | **178** | `telemetry.test.js` (7): off by default; string and attribute scrubbing; **real spans** scrubbed; the cache switch; **metrics from real HTTP requests**; AI labels without ids. `loadtestReport.test.js` (1) |
| pytest | 39 | 46 | 46 | **51** | `test_telemetry.py` (5): off by default; scrubbing; real spans scrubbed and keeping their trace ids; JSON logs with the trace id; a Claude call → latency + token metrics |
| Vitest | 106 | 108 | 109 | **109** | (the release-list test covers the new entry) |
| Playwright | 2 | 2 × 2 ledgers | same | same | |
| **Total** | **279** | **310** | **327** | **340** | |

**CI on PR C+D's head** (`87e7e80`), all green:
- backend (Node + Postgres);
- secret scan;
- pytest;
- React (typecheck, Vitest, build);
- Playwright on the mongo ledger and on the postgres ledger;
- Docker image;
- k6 load test.

## 7. Bugs planted on purpose (and real bugs the checks found)

| PR | Planted bug | Caught by |
|---|---|---|
| A | Removed `FOR UPDATE` | `ledger.pg.test.js`. Sells: 10 of 10 filled with only 5 shares owned. Buys: 10 got **500 errors** instead of "Insufficient funds" |
| A | Turned off the idempotency replay | Jest idempotency test (`expected 200, received 201`: charged twice) |
| B | Removed the conflict check | `ledgerMigration.pg.test.js`: newer Postgres cash would have been overwritten |
| B | Turned off the 422 check / put back the 1970 fallback | the two 422 tests (one per store) / the timestamp test |
| C | Turned off span scrubbing on the web side | `telemetry.test.js` real-span redaction test |
| C | Turned off scrubbing on the AI side | `test_real_spans_are_scrubbed…` |

**Real bugs found in my own C+D draft before commit:**
- an `enduser.email` attribute was scrubbed instead of dropped;
- route aliases were labelled with the wrong alias;
- two dashboard queries were invalid or empty (found by running them against real Prometheus).

## 8. Real numbers, each with its source

**Ledger (from the tests; run in CI on every push)**

| Number | Source |
|---|---|
| 20 parallel $10k buys across 2 app instances → exactly 10 filled, cash $0.00 | `tests/ledger.pg.test.js` |
| 10 parallel sells with 5 shares owned → exactly 5 filled | `tests/ledger.pg.test.js` |
| 5 simultaneous copies of one order → 1 trade | `tests/ledger.pg.test.js` |
| 10 × $10.01 → exactly 99,899.90 | `tests/ledger.pg.test.js` |

**Observability (measured locally)**

| Number | Source |
|---|---|
| One trade = one trace of **94 spans** across `nivesh-web` and `nivesh-ai` (local Jaeger) | `docs/OBSERVABILITY.md` §5 |
| No leaks: test email, password, JWT, internal token and order key absent from every span and log | `OBSERVABILITY.md` §5 |
| Web memory: telemetry off **104 / 104 MB**, on **111 / 112 MB**, so **about +8 MB** (I estimated 40–60 MB in the review) | `OBSERVABILITY.md` §5 |
| AI-down metric 1 → 0 within **40 s** | `OBSERVABILITY.md` §5 |
| SIGTERM to exit: **1.8 s** (was a 10 s timeout) | `OBSERVABILITY.md` §5 |

**Load test** (`docs/PERFORMANCE.md`, [Load test #4](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38203584203), commit `62245a1`):
- Machine: 4 vCPU / 15 GB GitHub runner, shared by k6 and the whole stack.
- Fake market data, Postgres ledger.

| Mix | Cache | Req/s | p50 | p95 | p99 | Errors | Hit rate | Requests |
|---|---|---|---|---|---|---|---|---|
| Read (20 users) | on | 121.9 | 3.2 ms | **9.6 ms** | 15.2 ms | 0% | 99.7% | 18,605 |
| Trade (10 users) | on | 17.4 | 14.3 ms | 21.8 ms | 35.3 ms | 0% | 99.9% | 2,640 |
| Read (20 users) | **off** | 120.2 | 5.5 ms | **22.3 ms** | 37.7 ms | 0% | 0% | 18,276 |
| Trade (10 users) | **off** | 17.4 | 13.8 ms | 21.5 ms | 33.9 ms | 0% | 0% | 2,642 |

What the numbers show:
- **Reads:** p95 is **2.3× slower** without the cache.
- **Trades:** about the same either way; their time is spent in the Postgres transaction.
- **Errors:** **0** in about 42,000 requests across two runs.
- **Cache lookups:** about **11 per trade**. That's why the cache is required on Finnhub's 60-calls-a-minute free plan.
- **Repeatability:** an earlier run, [#1](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38202627048), was within about 10–15%.

## 9. Every document I wrote in Phase 3

| File | What it is | PR |
|---|---|---|
| `docs/PHASE3_REVIEW.md` | The review of the Phase 3 instructions against the code: problems found, decisions D1–D10, the PR plan A–I | before A |
| `docs/PHASE3_PR_A_REPORT.md` | PR A report: your steps (credential rotation, Neon, token, App Spec, checks), changes, tests, planted bugs, limits, resume bullets | A |
| `docs/PHASE3_PR_B_REPORT.md` | PR B report: cutover steps, the move tool, review changes, tests | B |
| `docs/LEDGER_CUTOVER.md` | The cutover runbook: dry run → pause → migrate + verify → switch → checks → rollback | B |
| `docs/PHASE3_AB_FULL_REPORT.md` | Combined A + B report written for the planning chat before PR B was merged | B |
| `docs/OBSERVABILITY.md` | Grafana setup clicks, the metrics table, privacy rules, the 3 alerts and how to test one, local verification | C+D |
| `docs/PERFORMANCE.md` | Load-test results with the run link, exact setup, limits | C+D |
| `docs/PHASE3_PR_CD_REPORT.md` | PR C+D report: your Grafana steps, changes, tests, numbers, resume bullets | C+D |
| `docs/PHASE3_FULL_REPORT.md` | This file: A + B + C+D together | C+D |

**Also updated:** `CLAUDE.md` (Current progress, layout, rules), `docs/PHASE2_PLAN.md` (implementation notes), `.env.example`.

---

## 10. Where I differed from the instructions (please confirm with the planning chat)

**From PR A/B** (already accepted in the PR B review):
- unit tests use a MongoDB-store wrapper;
- holdings stay a JS fold;
- `/internal` returns 404, not 401;
- `--migrate` / `--export-since` were added;
- `/api/status` doesn't ping Postgres.

**New in PR C+D:**
1. **No `@opentelemetry/sdk-node` / auto-instrumentations bundle.** I wired only the instrumentations the app uses. This is why memory came in at +8 MB instead of 40–60 MB, and there is no gRPC.
2. **The alerts are a provisioning file plus click-by-click steps,** not imported automatically. Importing the file into Grafana Cloud needs its provisioning API and a service-account token. Creating 3 rules by hand is quicker and adds no new secret, and the file stays the exact definition.
3. **The load test also runs on PRs that change the load test,** not only manually. This is how the numbers in `PERFORMANCE.md` were produced inside this PR. It doesn't run on other PRs.
4. **The cache hit rate comes from the app's own metric** (Prometheus inside the load-test stack), not from Redis stats. It's the same counter the Grafana dashboard shows in production.
5. **Two small fixes outside the plan:**
   - SIGTERM now closes idle connections (deploys stop faster);
   - `console.*` was replaced by the JSON logger.
6. **User ids can appear in some traced URL paths** (e.g. `/api/ai/memory/<id>`). They're pseudonymous MongoDB ids, not emails or names. Metric labels never contain them (`:userId`). Say if you want them scrubbed from spans too.

## 11. Process notes, said plainly
- **PR A was merged before you had done its steps.** That's safe: `mongo` is the default, and `/internal` doesn't exist without the token. The steps still need doing (§1, Part 1).
- **PR C+D's branch was force-pushed once, before review, with lease.** The test fixtures held fake connection-string passwords that the secret scan flagged, so I rebuilt those commits with placeholder values. Nobody else had the branch.
- **I can't reach** the live site, Atlas, Neon, DigitalOcean or Grafana Cloud. Every live check is yours (§1).

## 12. Limits
**Ledger:**
- After a rollback, Postgres-only trades must be redone by hand (no copy-back, Q2).
- The MongoDB store's lock is per process.
- "Start over" after the cutover resets Postgres only.
- Neon's free plan sleeps after 5 idle minutes.

**Monitoring:**
- Not checked live yet (steps 11–17).
- Metrics are exported every 30 s, so panels and alerts lag by up to 30 s.
- A brand-new counter series can read 0 on `increase()` panels at first.
- Prisma traces are detailed (about 90 spans per trade); fine for the free tier, and can be trimmed.

**Load tests:**
- One shared CI machine.
- Fake market data, so the cache-off penalty is a **lower bound**.
- Closed-loop with 1 s think time, so requests/s is not the server's maximum; latency is the meaningful number.
- Real-infrastructure numbers come from PR E's AWS run.

## 13. Resume bullets (measured numbers only)
- Moved a paper-trading app's money ledger toward PostgreSQL with Prisma Migrate: `NUMERIC` money, database CHECK constraints and `SELECT … FOR UPDATE` row locks. In CI against real Postgres, 20 concurrent orders across two app instances never overspent: exactly 10 filled and cash ended at $0.00.
- Added idempotent order submission (an Idempotency-Key, unique per user): 5 simultaneous duplicate submissions produce exactly 1 trade. Built a repeat-safe migration tool (dry-run, per-account verify to the cent, rollback export).
- Added full-history secret scanning (gitleaks, checksum-pinned) to CI. It found live database, market-data and payment credentials in an early commit, and new leaks now fail the build.
- Instrumented a Node/Express + Python/FastAPI app with OpenTelemetry:
  - one trade is one distributed trace (94 spans across both services);
  - metrics feed a 15-panel Grafana dashboard and 3 alerts;
  - a redacting exporter is proven by tests to drop tokens, keys and emails;
  - about 8 MB of memory per instance.
- Built a k6 load-test pipeline in GitHub Actions that boots the full 6-service stack. Read-path p95 was 9.6 ms with Redis caching vs 22.3 ms without (2.3×) at a 99.7% hit rate, with 0 errors across about 42,000 requests.

## 14. What happens next
1. **You confirm** this with the planning chat, then say **"merge"**, and I merge PR C+D.
2. **You do** the live steps in §1, in order: Part 1 → Part 2 (cutover) → Part 3 (Grafana). Send the five items in the "What to send back" table, and I add them to the reports.
3. **I build the next independent PR** while you do those: **PR E**, the AWS demo (Terraform bootstrap, OIDC roles, plan/apply/destroy workflows, `docs/AWS.md`). Then F (nightly job through `/internal`), G (pre-trade check + stress test), and H+I (agent + evals).

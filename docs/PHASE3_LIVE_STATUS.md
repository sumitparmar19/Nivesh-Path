# Phase 3: live site status

**As of Oct 13, 2026.** From Sumit's and the planning chat's live reports (the latest: "Phase 3: complete status so far, and a full check of the live site", Oct 12 PT).

No secrets are in this file. Every value marked *secret* lives only in DigitalOcean, Neon, Atlas, Grafana or AWS. Hostnames, user names and the Grafana stack name are left out on purpose.

The full check of every page and feature is in `docs/PHASE3_LIVE_CHECK.md`.

## 1. What runs where

| Part | Where | State |
|---|---|---|
| Web + AI | DigitalOcean App Platform (`nivesh-path-vzeak.ondigitalocean.app`) | Live |
| Users, Behavioral Mirror events, AI memory, analyses | MongoDB Atlas: Sumit's own cluster, database `niveshpath` | Live |
| **Money ledger** (cash + trades) | **PostgreSQL 18.6 on Neon** (AWS us-east-1, branch `production`, database `neondb`) | **Live since the Oct 12 cutover** (`LEDGER_BACKEND=postgres`) |
| Monitoring | Grafana Cloud (OTLP endpoint in us-east-2) | Traces, metrics and logs all arriving. Dashboard imported; alert test fired |
| AWS demo | Free-plan account ($100 credit, ends Apr 11, 2027) plus the AWS Builder Center student subscription | Account exists. Bootstrap not run yet |

## 2. Accounts and services created

| Service | What exists | Notes |
|---|---|---|
| **Neon** | Project `nivesh-path` | Only "Postgres database" is enabled. The pooled URL has `&pgbouncer=true`; `channel_binding=require` is kept |
| **MongoDB Atlas** | Nothing new | The live `MONGO_URL` was confirmed to be Sumit's own cluster. The `dhrumil` user on `niveshpathcluster` belongs to someone else's cluster and isn't used live |
| **Grafana Cloud** | One stack | Token `nivesh-path-3` is in use. Tokens `nivesh-path` and `nivesh-path-2` were seen in screenshots; Sumit deletes them |
| **AWS** | Account | Bootstrap not run yet |
| **Stripe / Finnhub** | Sumit's own accounts | No Stripe variable is used any more. Sumit confirms the leaked keys were handled |

## 3. Live configuration (names only; `.do/app.yaml` mirrors it)

| Component | Variables (* = encrypted secret) |
|---|---|
| **web** | `AI_SERVICE_URL=${ai.PRIVATE_URL}`, `PUBLIC_BASE_URL=${APP_URL}`, `MONGO_URL`*, `FINNHUB_API_KEY`*, `JWT_SECRET`*, `RESEND_API_KEY`*, `CONTACT_TO_EMAIL`*, `AI_INTERNAL_TOKEN`*, `LEDGER_BACKEND=postgres` (RUN_TIME), `DATABASE_URL`* (Neon pooled, RUN_TIME), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`*, `OTEL_SERVICE_NAME=nivesh-web`, `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production` |
| **ai** | `CLAUDE_MODEL=claude-opus-5-5`, `ANTHROPIC_API_KEY`*, `MONGO_URL`*, `AI_INTERNAL_TOKEN`*, `WEB_INTERNAL_URL=${web.PRIVATE_URL}`, the same `OTEL_*` with `OTEL_SERVICE_NAME=nivesh-ai` (fixed Oct 12, §5 #6) |
| **jobs → migrate** (PRE_DEPLOY, `apps-s-1vcpu-0.5gb`, `npx --no-install prisma migrate deploy`) | `DATABASE_URL`* (pooled), `DIRECT_URL`* (direct) |

- **Removed:** `LEDGER_MAINTENANCE` (used only during the cutover) and `OTEL_LOGS_EXPORTER=none` (logs arrive since #16).
- **Never set on live:** `DEMO_FAULTS`, `DEPLOY_PLATFORM`, `DB_*`, `CACHE_DISABLED`.

## 4. What Sumit did, in order

1. **Credentials check.**
   - The live MongoDB is his own cluster.
   - `AI_INTERNAL_TOKEN` is set on both components.
   - Stripe and Finnhub keys handled.
2. **Neon created; App Spec edited.**
   - On web: `LEDGER_BACKEND=mongo` and `DATABASE_URL`.
   - On ai: `WEB_INTERNAL_URL`.
   - A top-level `migrate` PRE_DEPLOY job.

   The first attempt put the web variables under ai by mistake; it was corrected before the deploying save. The job applied `20261011225621_ledger_init`, and `db-check` returned `PostgreSQL 18.6`, 0 accounts, 0 trades.
3. **Ledger cutover** (Oct 12, about 18:26–18:43 UTC). Full outputs: `docs/PHASE3_PR_B_REPORT.md` §0.
   - **Dry run:** 1 user, 6 trades, 0 rounding changes, 0 blocking problems, 1 legacy row without a user skipped.
   - **Pause:** `LEDGER_MAINTENANCE=1`.
   - **`--migrate`:** created, 6 copied.
   - **`--verify`:** "All users match (1)": INTC 89, META 7, MSFT 7, QQQ 4, SPY 11.
   - **Switch:** `LEDGER_BACKEND=postgres`, with maintenance removed in the same save.
   - **After:**
     - the log shows `Ledger: postgres`, and What's new shows "Money ledger: PostgreSQL (Neon)";
     - a new DIA buy worked;
     - the Mirror shows impulse control 100 and diversification 83;
     - `db-check` returned 1 account and **8 trades**.
4. **Grafana.**
   - Stack created; token rotated twice (now `nivesh-path-3`); `OTEL_*` set on both components.
   - The log-export crash was found and fixed in #16; logs are confirmed in Loki.
   - Dashboard imported: 0.1 req/s, 0% 5xx, p95 4.93 ms, AI UP.
   - **The p95 alert test fired:** email "Nivesh-Path › Web: p95 latency above 1.5 s".
5. **Joined trace.** He fixed the ai service name (§5 #6), then confirmed the trace (§6).

## 5. Issues found on live, and how each was fixed

| # | Issue | Fix | Status |
|---|---|---|---|
| 1 | App Spec: web variables pasted under ai | YAML corrected before the deploying save | ✅ |
| 2 | Neon runs PG 18.6, while CI, compose and RDS ran 16 | #17 moved everything to 18 | ✅ |
| 3 | OTel log export crashed every batch (`reading 'export'`) | #16 | ✅ |
| 4 | AI memory status looked like a live count (5 trades vs 8) | #17 shows "Done at last restart, <time>" | ✅ |
| 5 | Grafana tokens exposed in screenshots (×2) | Rotated to `nivesh-path-3` | ⏳ delete the old two (§7) |
| 6 | **Joined trace showed "Services 1"** | `OTEL_SERVICE_NAME` on ai was `nivesh-web`, copied from web. A one-span export from the ai Console returned `SUCCESS`, so the token and endpoint were fine. Set to `nivesh-ai` at about 22:37 PT; ai logs and `nivesh_ai_llm_*` metrics from before then carry `service_name=nivesh-web`. **Now** both start-up lines say which name they export as, and `docs/OBSERVABILITY.md` §5c has the checklist | ✅ |
| 7 | The DigitalOcean console breaks pasted commands (`^[[200~` prefix) | Type `bind 'set enable-bracketed-paste off'` by hand once per session (`docs/OBSERVABILITY.md` §5c) | Docs tip |
| 8 | **Live check (Oct 13): after "Delete my account", the browser landed on `/login?redirect=/account`** (the account itself was deleted) | Fixed in the live-check PR (`docs/PHASE3_LIVE_CHECK.md` §3) | ✅ after merge |
| 9 | **Live check: pages jumped while loading** (Lighthouse CLS 0.6–0.75 on phones) | Fixed in the live-check PR (CLS 0.12 or lower) | ✅ after merge |

## 6. Monitoring evidence (screenshots with Sumit)

- **Joined trace** `4522bb43793083b426c4d835d5303515`: `GET /api/ai/memory` 200, **Services 2**, 26 spans, 86.64 ms, Oct 12 22:42:43 PT.
- The `nivesh-ai` service is in Tempo with its start-up spans and the `console-test` span.
- Web logs in Loki carry `trace_id`.
- Dashboard imported; the p95 alert email arrived.

## 7. Still open (Sumit), most urgent first

1. **Grafana:**
   - delete tokens `nivesh-path` and `nivesh-path-2`;
   - set the p95 alert back to **1.5 s, pending 10m**;
   - create the 5xx-rate and AI-health alerts if not done yet.
2. **Live check:** run the live smoke test once the live-check PR is merged and deployed (`docs/PHASE3_LIVE_CHECK.md` §5).
3. **The `dhrumil` user on `niveshpathcluster`** belongs to someone else's cluster: tell its owner to delete it. It can't reach the live data.
4. **Optional hardening:** a `nivesh-live` Atlas user with `readWrite` on `niveshpath` only, replacing the current user in `MONGO_URL` on both components.
5. **Before AWS D1:**
   - the `nivesh-demo` Atlas user;
   - a second free Finnhub account for the demo (planning-chat answer Q1);
   - MFA on root, the budget, the `sumit-admin` user, region **us-east-1**;
   - the CloudShell bootstrap (`docs/AWS.md` §4);
   - the GitHub `aws-demo` environment, its variables, and the Secrets Manager values.
6. **Nightly job** (after PR F is merged and deployed, and the bootstrap is done; `docs/AWS.md` §8.1):
   - a new `AI_INTERNAL_TOKEN`, the same value on web, on ai and in Secrets Manager `nivesh-path/jobs`;
   - GitHub → Actions → **AWS jobs: nightly job** → `apply`, then `run-now` after 4 pm New York;
   - send me the run link.

## 8. Planning-chat decisions on PR E (recorded)
- **Q1:** a separate free Finnhub account for the AWS demo.
- **Q2:** the deploy role, broad within its services in us-east-1, is acceptable. Keep the explicit denies and the custom Checkov rule.
- **Q3:** PR F uses the same deploy role and the `aws-demo` environment.
- **Q4:** no ARM/Graviton for now.

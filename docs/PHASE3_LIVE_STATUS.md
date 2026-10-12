# Phase 3: live site status

**As of Oct 12, 2026.** From Sumit's and the planning chat's live report. No secrets are in this file: every value marked *secret* lives only in DigitalOcean, Neon, Atlas or Grafana.

## 1. What runs where

| Part | Where | State |
|---|---|---|
| Web + AI | DigitalOcean App Platform (`nivesh-path-vzeak.ondigitalocean.app`) | Live |
| Users, Behavioral Mirror events, AI memory, analyses | MongoDB Atlas, Sumit's own cluster, database `niveshpath` | Live |
| **Money ledger** (cash + trades) | **PostgreSQL 18.6 on Neon** (us-east-1, branch `production`) | **Live since the Oct 12 cutover** (`LEDGER_BACKEND=postgres`) |
| Monitoring | Grafana Cloud (OTLP endpoint in us-east-2) | Traces + metrics exporting. Logs fixed in the follow-up PR |
| AWS demo | Free-plan account ($100 credit, ends Apr 11, 2027) | Account exists. Bootstrap not run yet |

## 2. Live configuration (names only; `.do/app.yaml` mirrors it)

| Component | Variables (* = encrypted secret) |
|---|---|
| **web** | `AI_SERVICE_URL=${ai.PRIVATE_URL}`, `PUBLIC_BASE_URL=${APP_URL}`, `MONGO_URL`*, `FINNHUB_API_KEY`*, `JWT_SECRET`*, `RESEND_API_KEY`*, `CONTACT_TO_EMAIL`*, `AI_INTERNAL_TOKEN`*, `LEDGER_BACKEND=postgres`, `DATABASE_URL`* (Neon pooled), `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS`*, `OTEL_SERVICE_NAME=nivesh-web`, `OTEL_RESOURCE_ATTRIBUTES`, and possibly `OTEL_LOGS_EXPORTER=none` (remove after the log fix) |
| **ai** | `CLAUDE_MODEL=claude-opus-5-5`, `ANTHROPIC_API_KEY`*, `MONGO_URL`*, `AI_INTERNAL_TOKEN`*, `WEB_INTERNAL_URL=${web.PRIVATE_URL}`, the same `OTEL_*` with `OTEL_SERVICE_NAME=nivesh-ai` |
| **migrate** (PRE_DEPLOY job) | `DATABASE_URL`* (pooled), `DIRECT_URL`* (direct) |

## 3. Done
- **PR A:**
  - Neon created; migration `20261011225621_ledger_init` applied by the PRE_DEPLOY job;
  - `db-check` OK on PostgreSQL 18.6;
  - `AI_INTERNAL_TOKEN` on both components;
  - the live `MONGO_URL` confirmed to be Sumit's own cluster.
- **PR B, the cutover:**
  - dry run: 1 user, 6 trades, 0 rounding changes, 0 blocking problems;
  - migrate → verify **"All users match (1)"** → switch;
  - afterwards Postgres held 1 account and 8 trades (6 copied + 2 new). A1 live acceptance met.
  - Full outputs: `docs/PHASE3_PR_B_REPORT.md` §0.
- **PR C+D:** telemetry exporting; trace ids in the logs. Details: `docs/PHASE3_PR_CD_REPORT.md` §0.

## 4. Still open (Sumit), most urgent first
1. **Roll the leaked Stripe secret key** in the Stripe dashboard (Developers → API keys → Roll key). The account is yours; no Stripe variable is used any more.
2. **Regenerate the Finnhub key** and update `FINNHUB_API_KEY` on web, unless it was already changed after the first commit.
3. **Grafana token:** confirm `nivesh-path-2` is in use on both components and the first token (seen in a screenshot) is **deleted**.
4. **After the log-export fix deploys:** delete `OTEL_LOGS_EXPORTER=none` on web if it was set, then check that logs appear in Grafana (`{service_name="nivesh-web"}`).
5. **Grafana:**
   - import `observability/grafana-dashboard.json`;
   - create the 3 alerts and an email contact point;
   - run the alert test (screenshot);
   - find the joined trace (screenshot).
6. **The `dhrumil` user on `niveshpathcluster`** belongs to someone else's cluster: tell its owner to delete it. It can't reach the live data.
7. **Optional hardening:** a `nivesh-live` Atlas user with `readWrite` on `niveshpath` only, replacing the current user in `MONGO_URL` on both components.
8. **Before AWS D1:**
   - the `nivesh-demo` Atlas user;
   - a second free Finnhub account for the demo (planning-chat answer Q1);
   - MFA on root, the budget, an admin user, region **us-east-1**;
   - the CloudShell bootstrap (`docs/AWS.md` §4).

## 5. Planning-chat decisions on PR E (recorded)
- **Q1:** a separate free Finnhub account for the AWS demo.
- **Q2:** the deploy role, broad within its services in us-east-1, is acceptable. Keep the explicit denies and the custom Checkov rule.
- **Q3:** PR F uses the same deploy role and the `aws-demo` environment.
- **Q4:** no ARM/Graviton for now.

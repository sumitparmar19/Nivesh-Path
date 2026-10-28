# Operations runbook

Step-by-step procedures for running Nivesh-Path: the live site on DigitalOcean, monitoring on Grafana Cloud, and
the AWS stacks. Design and reasoning live in the other docs; this page is only the steps.

**Never paste a password, key, token or connection string into an issue, a commit or a chat.** Values go only into
the DigitalOcean, Neon, Atlas, Grafana, AWS or GitHub screens named below.

| Section | For |
|---|---|
| [1. Live site (DigitalOcean)](#1-live-site-digitalocean) | Deploys, configuration, console checks |
| [2. Ledger operations](#2-ledger-operations) | Pausing trading, rollback, the MongoDB → PostgreSQL procedure |
| [3. Monitoring (Grafana Cloud)](#3-monitoring-grafana-cloud) | Setup, alerts, troubleshooting |
| [4. Live smoke test](#4-live-smoke-test) | Checking the real site end to end |
| [5. AWS: one-time bootstrap](#5-aws-one-time-bootstrap) | Account, CloudShell, GitHub settings |
| [6. AWS demo stack](#6-aws-demo-stack) | Create, check, load-test, fire an alarm, destroy |
| [7. Nightly job](#7-nightly-job) | Token, apply, run once, turn off |
| [8. Rotating secrets](#8-rotating-secrets) | What changes where |

---

## 1. Live site (DigitalOcean)

**Components** (spec: `.do/app.yaml`, which mirrors the live App Spec; editing the file doesn't change the live app):
- `web` (root `Dockerfile`, public, port 3000, health check `/health`);
- `ai` (`ai-service/Dockerfile`, internal only, port 8001);
- `migrate` (`PRE_DEPLOY` job: `npx --no-install prisma migrate deploy`).

**Deploys:** every push to `main` builds and deploys all three. The `migrate` job runs first; if it fails, the deploy
stops and the running version stays up. Watch **Apps → nivesh-path → Activity**.

**Change a variable:** Apps → nivesh-path → **Settings** → the component → **Environment Variables** → Edit → Save
(tick **Encrypt** for secrets). Saving redeploys the component. Secret names per component are listed in `.do/app.yaml`.

**Console checks** (Apps → nivesh-path → **Console** → web):
- `node scripts/db-check.js` → `{"ok":true,"server":"PostgreSQL …","migrations":[…],"accounts":N,"trades":N}`. It
  prints no secrets.
- `printenv OTEL_SERVICE_NAME` prints a name only. Never print `*_URL`, `*_KEY`, `*_TOKEN` or `OTEL_EXPORTER_OTLP_HEADERS`.
- If pasted commands arrive broken (`^[[200~` at the start), type `bind 'set enable-bracketed-paste off'` by hand
  once per console session.

**Roll back a React page:** web → add `REACT_DISABLED` = the route(s), e.g. `/markets,/stock` → Save. Those routes
serve the legacy HTML page until the variable is removed.

**Health:** `GET /health` (web), and `GET /api/status` (public): web, database, AI service, model, AI memory
rebuild, ledger backend and pause state. What's new shows the same panel.

| Symptom | Fix |
|---|---|
| `/health` shows `"db":"disconnected"` | Check `MONGO_URL` on web and Atlas → Network Access (`0.0.0.0/0`; App Platform has no fixed IP) |
| AI `/health` shows `vector_index` `failed` or `disabled` | `MONGO_URL` is missing or wrong on **ai** |
| The Advisor says "Rule-based insight" | `ANTHROPIC_API_KEY` is missing or invalid on **ai**, or the account has no credit |
| Advisor and coach stop answering | `AI_INTERNAL_TOKEN` differs between web and ai (§8) |
| Everyone is logged out | `JWT_SECRET` changed (old tokens become invalid). Log in again |
| Quotes fail | `FINNHUB_API_KEY` is invalid or over its limit: web's Runtime Logs show `Quote provider returned 401` (or 429) |

## 2. Ledger operations

**Pause trading** (Buy, Sell, Start over and Delete account answer "Trading is paused for a few minutes"; pages and
portfolios stay readable): web → add `LEDGER_MAINTENANCE` = `1` → Save. Remove it to reopen.

**Switch the ledger back to MongoDB** (rollback): web → `LEDGER_BACKEND` = `mongo` → Save. Then list the trades made
on PostgreSQL since the switch, which MongoDB doesn't have:
```
node scripts/migrate-ledger.js --export-since <switch time, e.g. 2026-10-12T18:43:00Z>
```

**Move MongoDB → PostgreSQL:** the full procedure (dry run, pause, copy, verify, switch, checks) is
[`LEDGER_CUTOVER.md`](LEDGER_CUTOVER.md). It was run on Oct 12, 2026 ([`LEDGER.md`](LEDGER.md) §5).

**New migration:** edit `prisma/schema.prisma`, run `npx prisma migrate dev --name <what>`, add any CHECK constraint
by hand in the generated SQL, commit. CI fails if the schema and migrations disagree; the `migrate` job applies it on
the next deploy.

## 3. Monitoring (Grafana Cloud)

Both services export traces, metrics and logs over OTLP when `OTEL_EXPORTER_OTLP_ENDPOINT` is set
([`OBSERVABILITY.md`](OBSERVABILITY.md)).

### 3.1 Set up
1. grafana.com → **Create free account** → a stack name and region (**US East** is closest to DigitalOcean NYC).
2. Stack home → **Connections → Add new connection** → **OpenTelemetry (OTLP)** → "OpenTelemetry SDK" → any language
   → **Create token**. Copy `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` (`Authorization=Basic%20…`,
   a secret).
3. DigitalOcean, on each component:

   | Variable | web | ai |
   |---|---|---|
   | `OTEL_EXPORTER_OTLP_ENDPOINT` | the endpoint | same |
   | `OTEL_EXPORTER_OTLP_HEADERS` | the headers (Encrypt) | same (Encrypt) |
   | `OTEL_SERVICE_NAME` | `nivesh-web` | `nivesh-ai` |
   | `OTEL_RESOURCE_ATTRIBUTES` | `deployment.environment=production` | same |

   After the redeploy, Runtime Logs show `Telemetry: exporting over OTLP as nivesh-web` (web) and `… as nivesh-ai` (ai).
4. **Dashboard:** Grafana → Dashboards → New → **Import** → upload `observability/grafana-dashboard.json` → pick the
   `grafanacloud-<stack>-prom` data source → Import.
5. **Contact point:** Alerting → Contact points → **+ Add contact point** → Email.
6. **Alerts:** Alerting → Alert rules → **+ New alert rule**, once per row of the table in
   [`OBSERVABILITY.md`](OBSERVABILITY.md) §4: name; Prometheus data source, **Code** editor, paste the query; "Reduce:
   Last" and the threshold; folder `Nivesh-Path`; evaluation group `nivesh-path` every **1m**; the pending period;
   the contact point.
7. **Test one alert:** set "Web: p95 latency above 1.5 s" to threshold **0.001** and pending **1m**, browse a few
   stock pages; within 2–3 minutes it fires and the email arrives. Put back **1.5** and **10m**; a "Resolved" email
   follows.
8. **Joined trace:** make a trade → Explore → the `…-traces` data source → Search → service `nivesh-web`, span
   `POST /api/trades` (or `/api/store-purchase`) → the newest trace shows **Services 2** (with
   `nivesh-ai POST /api/ai/transactions`).

### 3.2 A joined trace shows "Services 1"
Both components are probably exporting under the same name.
1. Check `OTEL_SERVICE_NAME`: `nivesh-web` on web, `nivesh-ai` on ai. Copying the `OTEL_*` variables from web to ai
   copies the name too.
2. Read the start-up line in each component's Runtime Logs: `Telemetry: exporting over OTLP as <name>`.
3. In the ai console, `printenv OTEL_SERVICE_NAME`.
4. Prove the export works with one test span from the ai console:
   ```
   python -c "from opentelemetry.sdk.trace import TracerProvider; from opentelemetry.sdk.trace.export import SimpleSpanProcessor; from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter; p=TracerProvider(); p.add_span_processor(SimpleSpanProcessor(OTLPSpanExporter())); p.get_tracer('console-test').start_span('console-test').end(); p.shutdown()"
   ```
   No error means the endpoint and token work; search Tempo for the `console-test` span. If it arrives but traces
   still show one service, the cause is the name.

### 3.3 Turning one signal off
`OTEL_TRACES_EXPORTER`, `OTEL_METRICS_EXPORTER` or `OTEL_LOGS_EXPORTER` = `none`. Remove the variable to turn it back on.

## 4. Live smoke test
GitHub → **Actions** → **Live smoke test** → **Run workflow**:
- leave the site URL as it is;
- tick **"Also run ONE AI analysis"** only when needed (one paid LLM call);
- tick **"Also send ONE contact-form message"** to test email (one real email).

It creates `e2e-live-<number>@example.com`, checks every page and feature, places small paper orders (buys 2 + 1
AAPL, sells 1 + 1) and deletes the user at the end, also when a step fails. Afterwards, `node scripts/db-check.js`
shows the counts from before the run, and Atlas → `users` filtered by `{ "email": { "$regex": "^e2e-live-" } }` is empty.

## 5. AWS: one-time bootstrap
Design: [`AWS.md`](AWS.md). Region: **US East (N. Virginia) `us-east-1`**.

1. **Account:** MFA on the root user; budgets at $10 and $25 (Billing → Budgets → "Monthly cost budget"); an admin
   user for daily use (IAM Identity Center, or IAM → Users with `AdministratorAccess`).
2. **Bootstrap in CloudShell:** check the console region says **US East (N. Virginia)** (CloudShell inherits it, and
   the script refuses any other region), open CloudShell (`>_`) and run:
   ```
   git clone --depth 1 https://github.com/sumitparmar19/Nivesh-Path.git ~/Nivesh-Path
   bash ~/Nivesh-Path/infra/bootstrap/cloudshell.sh
   ```
   It asks for the alert email, shows the plan and waits for `yes`. It installs Terraform 1.15.9 (checksum-verified,
   providers in `/tmp/tf-bootstrap` because CloudShell's home holds only 1 GB), creates the resources, and moves its
   state into the new S3 bucket. At the end it prints `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN` and `AWS_REGION` (not secret).
   - **Run it again later:** `cd ~/Nivesh-Path && git pull && bash infra/bootstrap/cloudshell.sh`. From another
     region's CloudShell, prefix `AWS_REGION=us-east-1`; the script finds the state in
     `s3://nivesh-path-tfstate-<account>` and never starts a second bootstrap.
3. **Confirm the alert email** ("AWS Notification - Subscription Confirmation" → **Confirm subscription**).
4. **GitHub** (repository → Settings):
   - **Environments → New environment** `aws-demo`: **Required reviewers** = the owner; **Deployment branches and
     tags** = "Selected branches and tags" → `main`.
   - **Secrets and variables → Actions → Variables → New repository variable**: `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`,
     `AWS_REGION` with the values from step 2.
5. **MongoDB Atlas:** Network Access allows `0.0.0.0/0` (Fargate public IPs change). A separate database user with
   `readWrite` on `niveshpath_demo` only, for the demo.
6. **Demo secret:** Secrets Manager → `nivesh-path/demo` → **Retrieve secret value** → **Set secret value** → five
   key/value rows. All five must exist, or a task fails to start with "did not contain json key":

   | Key | Value |
   |---|---|
   | `MONGO_URL` | the demo user's Atlas connection string, with `/niveshpath_demo` after `.net` |
   | `JWT_SECRET` | a **new** random value: `openssl rand -hex 32` |
   | `FINNHUB_API_KEY` | preferably a second free Finnhub key, so a load test can't use up the live site's 60 calls/minute |
   | `ANTHROPIC_API_KEY` | an Anthropic API key, or empty for the rule-based fallback |
   | `AI_INTERNAL_TOKEN` | a **new** random value, not the live site's: `openssl rand -hex 32` |

## 6. AWS demo stack
1. **Create and deploy:** Actions → **AWS demo: apply + deploy** → Run workflow (`main`) → **Review deployments →
   Approve**. About 15–20 minutes the first time (mostly RDS). The run summary shows the app URL and the dashboard link.
2. **Check:** open the URL, sign up, buy a share (the Behavioral Mirror note appears). What's new shows **Hosted on:
   AWS (demo stack, temporary)** and **Money ledger: PostgreSQL (AWS RDS)**.
3. **Load test:** Actions → **AWS demo: load test** → Run (defaults: 50 users, 8 minutes, 4 tickers) → Approve. The
   summary has the latency table and the web-task timeline every 20 s. Copy the summary into
   `docs/aws/LOADTEST_RESULTS.md` before the logs expire (90 days).
4. **Fire one alarm** (CloudShell):
   ```
   URL=http://$(aws elbv2 describe-load-balancers --names nivesh-demo --query 'LoadBalancers[0].DNSName' --output text)
   TOKEN=$(aws secretsmanager get-secret-value --secret-id nivesh-path/demo --query SecretString --output text | python3 -c 'import json,sys; print(json.load(sys.stdin)["AI_INTERNAL_TOKEN"])')
   for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code} " -H "X-Internal-Token: $TOKEN" "$URL/internal/demo-fault"; done; echo
   ```
   Ten `500`s; within about 2 minutes "ALARM: nivesh-demo-5xx" arrives, then "OK" about 2 minutes later. The route
   exists only on the demo stack (`DEMO_FAULTS=1`) and only with the token.
5. **Destroy:** Actions → **AWS demo: destroy** → type `destroy` → Run → Approve (10–15 minutes). The summary lists
   any remaining `Stack=demo` resources; it should be empty.

**Optional HTTPS:** Certificate Manager → Request a public certificate for `aws.<domain>` (DNS validation) → add the
CNAME at the DNS provider → once **Issued**, add the repository variable `AWS_DEMO_CERTIFICATE_ARN` and run **apply +
deploy**. Port 443 then serves TLS 1.2+ and port 80 redirects.

| Symptom | Cause, and what to do |
|---|---|
| "AccessDenied … AssumeRoleWithWebIdentity" | The `aws-demo` environment or the `AWS_ROLE_ARN` variable is missing or misspelled, or the workflow ran on a branch other than `main` |
| A task stops: "ResourceInitializationError … did not contain json key X" | Key X is missing from `nivesh-path/demo`. Add it, then run **AWS demo: deploy** |
| The deploy stops at "Migration failed" | The services weren't changed; the lines above it are `prisma migrate deploy` output |
| Quotes fail | The Finnhub key is invalid or over its limit |
| The Advisor answers "rule-based" | `ANTHROPIC_API_KEY` is empty or invalid |
| No plan comment on a PR | `AWS_PLAN_ROLE_ARN` isn't set (the plan job is skipped), or the PR comes from a fork |
| "not authorized to perform: SNS:ListTagsForResource" or "states:ValidateStateMachineDefinition" | The deploy role predates the current bootstrap policy. Re-run the bootstrap (§5 step 2), then the workflow; resources created before the failure stay and the next apply continues |
| `cloudshell.sh`: "This CloudShell is in us-east-2 …" | Switch the console to US East (N. Virginia), or run with `AWS_REGION=us-east-1` |
| `terraform init`: "no space left on device" | Remove an older `~/Nivesh-Path/infra/bootstrap/.terraform`, `git pull`, run the script again |

## 7. Nightly job
Design: [`AWS.md`](AWS.md) §8. Needs the bootstrap (§5), not the demo stack.
1. **One token in three places.** DigitalOcean never shows an encrypted value again, so make a new one
   (`openssl rand -hex 32` in CloudShell) and set it, the same value each time, on: DigitalOcean web
   `AI_INTERNAL_TOKEN`; DigitalOcean ai `AI_INTERNAL_TOKEN`; AWS Secrets Manager `nivesh-path/jobs` → key
   `AI_INTERNAL_TOKEN`. No Finnhub key is needed there: web fetches the quotes.
2. **Apply:** Actions → **AWS jobs: nightly job** → action `apply` → Approve. The summary shows the schedule
   (`cron(30 16 ? * MON-FRI *)`, America/New_York).
3. **Run once now, after 4:00 pm New York:** the same workflow → action `run-now` → Approve. The summary lists the held
   tickers, closes saved / skipped / failed, and the concentration-check counts. During market hours every close is
   "skipped" by design.
4. **Turn off:** action `destroy` + type `destroy`. Saved closes stay in PostgreSQL.

**Failure emails** name the step: `TokenRejected` means the token in Secrets Manager doesn't match web's (redo step
1); `WebUnavailable` after retries means the live site was down (the next run catches up); `SomeSnapshotsFailed`
lists the tickers whose close couldn't be fetched (check the Finnhub key).

## 8. Rotating secrets

| Secret | Where it lives | Effect of changing it |
|---|---|---|
| `JWT_SECRET` | DigitalOcean web | Everyone is logged out |
| `AI_INTERNAL_TOKEN` | DigitalOcean web **and** ai, plus `nivesh-path/jobs` for the nightly job | Set ai and web in the same save (or web first): if only ai has the new value, the Advisor and coach stop answering until web has it too |
| `MONGO_URL` | DigitalOcean web and ai | Both must point at the same database |
| `DATABASE_URL` / `DIRECT_URL` | DigitalOcean web (pooled, `&pgbouncer=true`) and the `migrate` job (both) | Migrations need the direct URL |
| `FINNHUB_API_KEY` | DigitalOcean web; `nivesh-path/demo` | Live prices and the nightly job's closes fail while it's invalid |
| `ANTHROPIC_API_KEY` | DigitalOcean ai; `nivesh-path/demo` | Without it the Advisor and coach answer rule-based |
| `OTEL_EXPORTER_OTLP_HEADERS` | DigitalOcean web and ai | Create a new Grafana token first, then delete the old one |
| `RESEND_API_KEY`, `CONTACT_TO_EMAIL` | DigitalOcean web | Contact-form email only |

Make random values with `openssl rand -hex 32` or `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

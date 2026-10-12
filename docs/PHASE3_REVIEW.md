# Phase 3 review: the instructions checked against the real code

**What I checked:** `NIVESH_PATH_PHASE3_COMPLETE.md` (Parts 1–4), line by line, against `main` at `463ddc7` (after PR #11; 279 tests: 132 Jest + 39 pytest + 106 Vitest + 2 Playwright, matching the file).
**Status:** review only. I'll build after Sumit says "go".

**Verdict:**
- The plan is sound and in the right order.
- I found **6 things that would break or leak data if built as written** (section 1), plus about 20 smaller corrections. Each one is listed with what I'll do instead.
- The riskiest step is moving live cash and trades (A1), so I propose a cutover with a switch and a rollback (section 2.4).

**What I can and can't run from this sandbox:**
- **Can run here:** Postgres 16 (so ledger tests hit a real database), Prisma, Terraform (`fmt`, `validate`), npm/PyPI packages, and Chromium for Playwright and Lighthouse.
- **CI only:**
  - k6, because GitHub release downloads are blocked here;
  - `terraform plan` and `apply`, because they need AWS.
- **Out of reach entirely:** the live site, Neon, Grafana Cloud and AWS. Every live check is done by Sumit or by CI.

---

## 1. Blocking issues (would break or leak data as written)

| # | In the instructions | Problem | What I'll do |
|---|---|---|---|
| 1 | Trades move to Postgres; `behavioral_events`, AI memory and analyses stay in MongoDB and keep referring to trades | `BehaviorEvent.tradeId` is a **MongoDB ObjectId**. New Postgres ids (serial/uuid) would break every pattern → trade link, the card's time/size lookup, the start-up clean-up and AI memory ids | Postgres `trades.id` is a **24-character ObjectId string**. Migrated trades keep their exact Mongo id, and new trades get a fresh ObjectId string. Nothing in Mongo has to change |
| 2 | "An internal Node endpoint protected by `AI_INTERNAL_TOKEN`" for the AI rebuild (and in Part 3 for the agent's tools) | The token is **optional** today. If it's unset, an internal endpoint on the public web component would hand **any user's trades** to anyone | Internal endpoints (`/internal/*`) are **disabled unless `AI_INTERNAL_TOKEN` is set** (404 otherwise), use constant-time comparison, are never served by the React fallback, and are tested. So the token becomes **required** before A1 ships |
| 3 | OIDC role trusted by "the `aws-demo` environment **and** the `main` branch"; `plan` posted on every PR | GitHub's OIDC `sub` claim for an environment job is `repo:sumitparmar19/Nivesh-Path:environment:aws-demo`; it **doesn't contain the branch**, so one role can't require both. A PR's `plan` job can't use the environment at all (`sub` = `…:pull_request`) | **Two roles.** (a) A **deploy role** trusted only by `environment:aws-demo`; the environment's GitHub settings restrict it to `main` and require Sumit's approval. (b) A **read-only plan role** trusted by `pull_request`, which can read state and describe resources but change nothing |
| 4 | Part 3 "needs nothing new" from Sumit | The **live** eval workflow runs in GitHub Actions and needs the Anthropic key there | Sumit adds `ANTHROPIC_API_KEY` as a GitHub **environment secret** (on a new `evals` environment, so only that manually approved workflow can read it) |
| 5 | Run `prisma migrate deploy` before the new version serves traffic | The Docker image is **Alpine** (`node:22-alpine`): Prisma needs the `linux-musl-openssl-3.0.x` engine. Without it the container crashes at start | `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`, plus a CI step that boots the built image and runs one Prisma query |
| 6 | Bootstrap "in CloudShell" with Terraform | **CloudShell doesn't include Terraform**, and bootstrap state would sit only in CloudShell's home folder (lost if the environment is reset) | The paste block first downloads Terraform into `~/bin` (HashiCorp's official zip, version pinned, checksum verified). After the bucket exists, it moves its own state into that bucket |

## 2. Part 1: Postgres, observability, load tests

### 2.1 What's different in the code than the file assumes
- **Cash** isn't in a separate account record. It's `cashBalance` and `totalDeposited` on the MongoDB **User** document.
  - New Postgres table `accounts` (`user_id` text primary key = the Mongo user id, `cash NUMERIC(14,2) CHECK (cash >= 0)`, `total_deposited NUMERIC(14,2)`).
  - **Users and auth stay in MongoDB**, as the file suggests.
  - Mongo's `cashBalance` is left untouched as the backup.
- **Holdings aren't stored.** They're derived from trades (`buildHoldings`). They stay derived, as a `GROUP BY` over `trades`, so there's no second copy to drift.
- **`behaviorCheckedAt`** moves with the trade, as `trades.behavior_checked_at`.
- **Today's concurrency guard** is an in-process lock (`withUserLock`). It's replaced by `SELECT … FOR UPDATE` on the account row inside a Prisma interactive transaction, which also works with more than one web instance.
- **Readers of trade data** (all found with `grep`):
  - `ledger.js`;
  - `routes/purchases.js` (trade, history, holdings, summary, reset);
  - `routes/account.js` (delete);
  - `routes/ai.js` (Advisor holdings and history);
  - `routes/patterns.js` (scores, card time/size lookup);
  - `behaviorDetector.js` (checked mark);
  - `behaviorMigration.js`;
  - `routes/auth.js` (sets starting cash);
  - the legacy `public/assets/trade.js` (calls the same API, so no change needed);
  - in the AI service, `services/mongo_store.py` `TradeStore`, which **reads the `purchases` collection directly** for the boot rebuild.

  All of them get switched.
- **No cache switch exists.** I'll add `CACHE_DISABLED=1` for the k6 "cache off" run.
- **Quantities:** both UIs send whole shares, but the API accepts fractions. See decision D1.
- **Tests:** both backend test files (`tests/app.test.js`, `tests/behavior.test.js`) run the app against in-memory fake models instead of a database. Rather than force all 279 tests onto a database, the ledger gets a small **store interface** with two versions: Postgres (real) and in-memory (fast unit tests).
  - A new **Postgres integration suite** runs against a real Postgres service container in CI, as asked: constraints, 20 parallel buys, idempotent retry, migration script, reset/delete, and the AI rebuild path.
  - So "all existing tests pass" stays true, with only ledger-internal changes, each listed.

### 2.2 Money and precision
- `cash` and `total_deposited`: `NUMERIC(14,2)`. `price`: `NUMERIC(14,4)`. `total`: `NUMERIC(14,2)`.
- **Rounding:**
  - Mongo floats are converted with half-up rounding to those scales (today's code already rounds totals and cash to cents).
  - The migration report lists every row whose value changed by rounding.
  - Totals are recomputed as `round(price × quantity, 2)` and compared with the stored total.
- In JavaScript, money is handled as Prisma `Decimal`, never a float, until it's formatted for JSON.

### 2.3 Rules in the database
- `CHECK (cash >= 0)`, `CHECK (quantity > 0)`, `CHECK (price > 0)`.
- A foreign key from `trades.user_id` to `accounts.user_id`.
- **Idempotency:** a nullable `idempotency_key` with `UNIQUE (user_id, idempotency_key)`.
  - The React trade panel and the legacy `trade.js` send an `Idempotency-Key` header (a new random id per order).
  - A retry with the same key returns the original trade instead of buying twice.
- **Sells:** the share check happens inside the same locked transaction.

### 2.4 The live data move: biggest risk, proposed cutover
**Risks:**
- losing a trade made during the copy;
- a cash mismatch;
- being unable to roll back.

**Plan:** a switch, `LEDGER_BACKEND=mongo|postgres`, default `mongo`.
1. **PR A ships with the switch on `mongo`.** The live site behaves exactly as today; Postgres is only migrated (empty tables).
2. **`--dry-run` on the live data** from the DigitalOcean **Console**:
   - `node scripts/migrate-ledger.js --dry-run` prints the per-user report and changes nothing;
   - Sumit sends me the report, and we check rounding and any fractional shares.
3. **Cutover (about 5 minutes):**
   - set `LEDGER_MAINTENANCE=1`: trades answer "Trading is paused for a few minutes" and reads still work;
   - run `--migrate`, then `--verify` (cash and holdings must match to the cent for every user, otherwise it exits non-zero and nothing is switched);
   - set `LEDGER_BACKEND=postgres` and remove `LEDGER_MAINTENANCE`.
4. **Rollback:** set `LEDGER_BACKEND=mongo`.
   - Mongo is untouched, so the site returns to its pre-cutover state.
   - Trades made in Postgres after the cutover would be missing from Mongo. The script has `--export-since <time>` to list them, and the runbook says so plainly.
5. **About a week later**, a small PR removes the Mongo ledger code path. The Mongo data stays as a backup.
- The script can run twice safely (upserts keyed by the Mongo id) and never writes to MongoDB.

### 2.5 Migrations on DigitalOcean
- I recommend a **PRE_DEPLOY job** in `.do/app.yaml`: same image, runs `npx prisma migrate deploy`. If it fails, the deploy stops and the old version keeps running.
- That's better than putting it in the run command, where a failing migration would crash-loop the live container.
- It needs `DIRECT_URL`, because migrations can't run through Neon's pooler.

### 2.6 Neon specifics
- **Pooled vs direct:** the pooled URL is used by the app (with `pgbouncer=true` so Prisma avoids prepared statements); the direct URL is used for migrations.
- **Free plan sleeps after 5 minutes idle**, so the first request after a pause takes about 0.3–1 s longer.
  - This affects the "p95 > 1.5 s" alert and the live latency numbers. The alert will need a minimum request rate so a quiet site doesn't fire it.
  - I'll note it in `PERFORMANCE.md` (k6 runs against a local Postgres in CI, so it isn't affected).

### 2.7 A2: observability
- **Node:**
  - OpenTelemetry SDK with auto-instrumentation (HTTP, Express, MongoDB, Redis, outgoing fetch) and `@prisma/instrumentation`;
  - custom metrics (trades, detections by type, cache hits/misses by cache, AI latency/tokens);
  - JSON logs (pino) with the trace id.
- **Python:** FastAPI + httpx (the Anthropic SDK uses httpx) + pymongo instrumentation; token counts from the Anthropic response.
- **One trace across both services:** trace-context headers through `aiClient`.
- **Off unless `OTEL_EXPORTER_OTLP_ENDPOINT` is set.** A redaction filter strips `authorization`, cookies, `x-internal-token`, bodies and emails; a test checks this.
- **Memory:** the web component has 0.5 GB. The SDK adds roughly 40–60 MB. I'll measure it locally and report it; if it's tight, only the instrumentations we use are loaded.
- **Alerts:** "AI service health failing" needs a metric, so the web service exports `ai_service_up` (0/1) from its existing health check every 60 s.
- **Testing an alert:** temporarily lower its threshold, as documented in `docs/OBSERVABILITY.md`, then restore it.

### 2.8 A3: k6
- The workflow:
  - builds the images;
  - creates a CI `.env` (the compose file reads `.env`);
  - starts the stack with `FAKE_MARKET_DATA=1` and a Postgres service;
  - registers its own test users;
  - runs a read mix and a trade mix, cache on, then `CACHE_DISABLED=1`;
  - uploads the JSON summaries.
- **Honest caveat for `PERFORMANCE.md`:** the app and k6 share one GitHub runner, so absolute numbers reflect that machine. The **cache on/off comparison** is the meaningful part. The AWS run in Part 2 gives the "real infrastructure" numbers.
- Claude is excluded. The Advisor rate limit would distort a load test anyway.

## 3. Part 2: AWS with Terraform, plus the nightly job

### 3.1 Corrections
- **OIDC:** two roles (blocking issue 3).
- **Bootstrap:** Terraform downloaded inside CloudShell (blocking issue 6). State uses native S3 locking (`use_lockfile`, Terraform ≥ 1.10); no DynamoDB.
- **One secret → two secrets:**
  - `nivesh-path/demo` (demo stack: Mongo URL, JWT secret, Finnhub, Anthropic, internal token);
  - `nivesh-path/jobs` (nightly job: the web service's internal token and Finnhub only; **updated after the PR B review**: the job reaches data through token-protected `/internal` endpoints, so it holds no database credentials).
  - The demo's **RDS password isn't typed by anyone**: RDS creates and stores it in Secrets Manager itself (`manage_master_user_password`).
  - Two narrow secrets give least privilege: the nightly job can't read the Anthropic key.
- **MongoDB Atlas network access:**
  - Fargate tasks and Lambdas outside a VPC have changing public IPs, so Atlas must allow `0.0.0.0/0` (with a strong password and TLS).
  - DigitalOcean's outgoing IPs aren't fixed either, so it's probably set that way already. **Sumit should check** (step P2-4 in section 6).
- **Redis:** the live site falls back to in-memory caching when `REDIS_URL` is unset. **The demo stack uses the in-memory cache**: cheapest, and it keeps the stack self-contained. I'll say so in `docs/AWS.md`.
- **Task sizes:**
  - web 0.25 vCPU / 0.5 GB;
  - ai 0.5 vCPU / 1 GB (ChromaDB + FastAPI; measured locally first);
  - the migration task 0.25 / 0.5.
- **No NAT:**
  - tasks in public subnets with public IPs, security groups allowing only the ALB;
  - RDS in private subnets, reachable only from the task security groups;
  - ECR image pulls and CloudWatch logs go out through the public IP (no VPC endpoints, which would cost more than they save for a short-lived demo);
  - write-up in `docs/AWS.md`.
- **Public IPv4 is charged** ($0.005/hour per address: ALB nodes and each task). That goes in the cost table.
- **Test 5xx route:** `GET /internal/demo-fault` exists only when `DEMO_FAULTS=1`, which is set only in the demo stack, and is token-protected.
- **The new AWS Free plan:**
  - I can't confirm from here that every service used (ECS, ALB, RDS, Step Functions, Scheduler) is available on Free-plan accounts.
  - The apply workflow fails clearly if one isn't.
  - Upgrading to the Paid plan keeps the credits. Sumit decides then.

### 3.2 Nightly job (`infra/jobs`)
- **Lambda packaging:**
  - `esbuild` bundles each Lambda from the **same** `src/lib/behaviorRules.js` file. One copy, no published package.
  - The Lambdas use the small `pg` driver instead of Prisma: Prisma's engine is about 15 MB per function, and the job runs only three simple queries.
  - The `price_snapshots` table itself is still created by a **Prisma migration**.
- **Holidays and repeats:**
  - Finnhub returns the previous close on market holidays.
  - Snapshots are keyed `UNIQUE (symbol, trading_date)`, with the date taken from Finnhub's quote timestamp, so a holiday doesn't create a fake "trading day" and a re-run doesn't duplicate rows.
- **Schedule:** EventBridge Scheduler in `America/New_York`, weekdays at 16:30.
- **Finnhub's free limit (60 calls/minute):**
  - the Step Functions Map runs at most **2** tickers at a time, with a short wait and retries with backoff;
  - the run fails, and sends the SNS email, only after the retries are used up.
- **Rule v3:** once a ticker has ≥ 5 stored trading days, the 5-day move comes from our own snapshots; before that, it falls back to Finnhub.
  - Today's live move is still combined as in v2.
  - `RULE_VERSION = 3`, with boundary tests and updated "how patterns are detected" text.
  - **v3 doesn't change any thresholds**, so the start-up clean-up has nothing to re-grade. It only records which data source was used.

### 3.3 Costs (estimates, to be finalised from the AWS price list in `docs/AWS.md`)
| Stack | When running | Notes |
|---|---|---|
| `infra/demo` | about $1.5–2 per day: ALB ~$0.55/day, RDS t4g.micro ~$0.40/day, 2–4 Fargate tasks ~$0.40–0.80/day, public IPs ~$0.25/day, logs | Destroyed after each demo, so a few dollars per demo day |
| `infra/jobs` | about **$0.40–1 per month**: Secrets Manager $0.40/secret, Lambda/Step Functions/Scheduler within free usage | Always on |

## 4. Part 3: pre-trade check, stress test, agent, evals
- **C1, pre-trade check:**
  - It reuses `behaviorRules` plus the detector's market facts (cached).
  - For concentration it uses a new **pure** function that builds the portfolio as if the order had been filled, so Phase 2D shares the exact same rules.
  - Saves nothing except a `trade_checks` record (MongoDB) holding the warnings and the outcome (`proceeded` / `cancelled` / no decision).
  - The trade request carries the `checkId`, so "You cancelled 3 of 5 warned trades" is computed from real records.
  - The panel waits at most ~1.2 s for the check; after that it behaves exactly as today.
- **C2, stress test, built in Node rather than the AI service (decision D5):**
  - Betas come from Finnhub `metrics`, which only the Node service can fetch (the AI service has no Finnhub key and shouldn't need one).
  - So the stress test is a **pure function next to `behaviorRules`**, exposed to the page and to the agent's `stress_test` tool.
  - Missing beta = 1.0, labelled "assumed 1.0". Cash doesn't move.
- **C3, LangGraph agent:**
  - Today the AI service calls the Anthropic SDK directly; the agent adds `langgraph` + `langchain-anthropic` (tool calling).
  - The final answer keeps today's structured `AIInsight` shape, so the UI and saved history keep working.
  - Every tool calls Node's `/internal/*` endpoints with the token **and** the user id (blocking issue 2). The tools can't reach another user's data, because the Node side filters by the user id the backend passed in, not by anything the model wrote.
  - **Guardrails:**
    - at most 6 tool calls and a total timeout;
    - metrics computed in code still overwrite the model's numbers;
    - a **runtime "number grounding" check** compares every number in the answer with the tool outputs, and drops ungrounded sentences or falls back to the rule-based answer;
    - paper trading only;
    - the existing rate limits apply;
    - the rule-based fallback answers when there's no key.
  - **Cost** (decision D6): an agent makes 2–6 model calls per question. I recommend **Claude Sonnet 5.5** for the agent and the evals, configurable, rather than today's Opus 5.5.
- **C4, evals:**
  - **Recorded mode** replays saved model responses and runs in CI, where it must pass 100%.
  - **Live mode** runs manually behind the `evals` environment (blocking issue 4) and writes pass rate, latency and cost per question to `docs/EVALS.md`.

## 5. Part 4: portfolio site, profile README, other repos
- **This session can only push to Nivesh-Path, on its assigned branch.** The portfolio and profile repos need **a separate Claude Code session started on those repos** (recommended), so their work doesn't wait on Parts 1–3.
- **The profile README repo must be named exactly `sumitparmar19`** (same as the username) and be **public**, or GitHub won't show it.
- **Site stack:**
  - Next.js static export (`output: "export"`) on Vercel Hobby, with GitHub Pages as fallback;
  - Mermaid diagrams rendered to SVG at build time (no heavy client-side script);
  - Lighthouse measured in CI with Chromium, and the real scores reported.
- **Content I can't invent** (the "no fake content" rule): Sumit's email to show, LinkedIn URL, resume PDF, the course-policy answer for the kernel, and the facts for the Analytics Pipeline and Kernel case studies (I'll write only what their code and Sumit confirm).
- **License:** an MIT license on Nivesh-Path is Sumit's call (decision D10). Phase 2 removed the copied/third-party content, so nothing I know of blocks it.

## 6. What Sumit must create, click or paste, in order

**Part 1 (before PR A merges)**
1. **Neon** (neon.tech, sign in with GitHub):
   - create project `nivesh-path`, region **AWS US East (N. Virginia)** (closest to DigitalOcean NYC);
   - copy two connection strings from the **Connect** dialog: **Pooled** (add `&pgbouncer=true`) → `DATABASE_URL`, and **Direct** → `DIRECT_URL`;
   - paste both into DigitalOcean → web component → Environment Variables, **Encrypt** on.
2. **`AI_INTERNAL_TOKEN`** must be set on **both** components before PR A merges (blocking issue 2). This was planned already.
3. After the deploy, **Console tab (web component)**: `node scripts/migrate-ledger.js --dry-run`, then send me the output.
4. **Cutover:**
   - add `LEDGER_MAINTENANCE=1` (web, save);
   - in the Console run `node scripts/migrate-ledger.js --migrate` and then `--verify`;
   - if verify prints "all users match", set `LEDGER_BACKEND=postgres` and delete `LEDGER_MAINTENANCE` (one save).

   The exact text is in `docs/LEDGER_CUTOVER.md`.
5. **Grafana Cloud** (free; sign up, create a stack):
   - **Connections → OpenTelemetry** → copy the OTLP endpoint and the generated `Authorization` header;
   - on **both** components add:
     - `OTEL_EXPORTER_OTLP_ENDPOINT`;
     - `OTEL_EXPORTER_OTLP_HEADERS`, in the form `Authorization=Basic%20<value>`;
     - `OTEL_SERVICE_NAME` (`nivesh-web` on web, `nivesh-ai` on ai);
     - `OTEL_RESOURCE_ATTRIBUTES=deployment.environment=production`.
   - Then import `observability/grafana-dashboard.json` and the alert rules, and add an email contact point (steps in `docs/OBSERVABILITY.md`).
6. Nothing to do for k6; the workflow is manual: Actions → "Load test" → Run.

**Part 2**
1. **AWS account:**
   - Free plan, **MFA on root**, budgets at $10 and $25;
   - create an IAM Identity Center or IAM admin user for console work (don't use root);
   - choose region `us-east-1`.
2. **CloudShell:** paste the bootstrap block from `docs/AWS.md`. It prints `AWS_ROLE_ARN` (deploy) and `AWS_PLAN_ROLE_ARN` (read-only).
3. **GitHub → Settings:**
   - **Environments → New `aws-demo`**: required reviewer = Sumit, deployment branches = `main` only;
   - **Variables → Repository**: `AWS_ROLE_ARN`, `AWS_PLAN_ROLE_ARN`, `AWS_REGION=us-east-1`.
4. **MongoDB Atlas → Network Access:** confirm `0.0.0.0/0` is allowed (or add it).
5. **Secrets Manager → `nivesh-path/demo` → Retrieve secret value → Edit:**
   - keys `MONGO_URL` (a **separate demo database name** in the same cluster is recommended, so demo test users don't mix with live ones), `JWT_SECRET` (new random value), `FINNHUB_API_KEY`, `ANTHROPIC_API_KEY`, `AI_INTERNAL_TOKEN` (new random value);
   - **`nivesh-path/jobs`:** `AI_INTERNAL_TOKEN` (same value as the live site) and `FINNHUB_API_KEY`. No database URLs (decided in the PR B review).
6. **Confirm the SNS email** sent to the address used at bootstrap.
7. Optional: **ACM DNS record** at Namecheap for `aws.<domain>` (only once the domain exists).

**Part 3**
1. **GitHub → Environments → New `evals`**: required reviewer = Sumit; environment secret `ANTHROPIC_API_KEY` (blocking issue 4).
2. Run "Live evals" once (about $1–3 on Sonnet; the real cost is reported).

**Part 4** (in the second session)
1. Create **public** repos `portfolio` and `sumitparmar19`.
2. **Vercel:** sign in with GitHub, then **Add New → Project → Import `portfolio`**.
3. **Domain:** GitHub Student Pack → Namecheap `.me`; in Vercel → Domains, add it and copy the records into Namecheap DNS.
4. Send me: resume PDF, LinkedIn URL, the email to display, the kernel course-policy answer, which repos to make public (and license), and the code for the pipeline and kernel repos.

## 7. Decisions for Sumit (with my recommendation)

| # | Decision | Recommendation |
|---|---|---|
| D1 | Quantity: whole shares only (`INTEGER`) or fractional (`NUMERIC`) | **Whole shares.** Both UIs already enforce it; the dry-run reports any old fractional rows before we commit |
| D2 | Cutover: short maintenance pause, or dual-write | **Maintenance pause (~5 min)**: simpler and verifiable; dual-write adds a lot of risk for a single-user-scale site |
| D3 | Migrations: DigitalOcean pre-deploy job, or run command | **Pre-deploy job**: a failed migration stops the deploy instead of crash-looping |
| D4 | Users/auth: stay in MongoDB, or move | **Stay**: no money in them, and moving them doubles the risk of the cutover |
| D5 | Stress test: Node (pure function), or AI service | **Node**: the betas and portfolio live there, and the agent calls it as a tool |
| D6 | Agent and eval model | **`claude-sonnet-5-5`** (configurable). Keep Opus for nothing that runs per request |
| D7 | Secrets: one or two | **Two** (`demo`, `jobs`): least privilege |
| D8 | Bootstrap: Terraform in CloudShell, or CloudFormation | **Terraform in CloudShell**: one tool everywhere, matching the skills goal |
| D9 | Part 4 in a second session on the new repos | **Yes**, in parallel |
| D10 | MIT license on Nivesh-Path (and which other repos go public) | Yours. MIT is fine if you want reuse allowed |

## 8. PR plan and live checks before each merge

| PR | Contents | Sumit checks on the live site before merge / after deploy |
|---|---|---|
| **A** Postgres foundation | Prisma schema + migrations, ledger store interface (Mongo + Postgres), constraints, `FOR UPDATE`, idempotency, `/internal/*` (token required), AI rebuild through Node, docker-compose + CI Postgres, `LEDGER_BACKEND` (default `mongo`) | After deploy: the site works exactly as before; the pre-deploy job log shows the migration applied on Neon |
| **B** Ledger move | `scripts/migrate-ledger.js` (dry-run/migrate/verify/export-since), `docs/LEDGER_CUTOVER.md` | Dry-run report sent to me → cutover → verify "all users match" → same cash/holdings/history → a new trade + Mirror check works |
| **C** Observability | OpenTelemetry both services, metrics, JSON logs, redaction, dashboard + 3 alerts, `docs/OBSERVABILITY.md` | A live trade shows as one joined trace; dashboard shows data; one alert fired and resolved |
| **D** Load tests | `CACHE_DISABLED`, `loadtest/`, k6 workflow, `docs/PERFORMANCE.md` with the run link | Nothing live (CI only) |
| **E** AWS demo | bootstrap, `infra/demo`, plan/apply/deploy/destroy workflows, security scan, `docs/AWS.md` (Mermaid, runbook, costs, NAT trade-off) | Plan comment clean → apply → app works on the ALB → k6 + scaling + alarm email → destroy |
| **F** Nightly job | `infra/jobs`, `price_snapshots` migration, Lambdas (esbuild + `pg`), rule v3 | One manual run on live data: snapshots + any events shown |
| **G** Pre-trade check + stress test (2D) | C1 + C2 + UI + Mirror "cancelled N of M" | Buy something that triggers a warning → Cancel / Place anyway; stress-test table on Portfolio |
| **H** Agent Advisor | LangGraph agent, 5 tools, guardrails, tool list in UI, tracing spans | Ask the Advisor a question; see "Checked: …" |
| **I** Evals | recorded (CI) + live workflow, `docs/EVALS.md` | Run "Live evals" once |
| **D-cleanup** (about a week after B) | Remove the Mongo ledger path | Site unchanged |

- Each PR gets the report format at the end of the instructions, including the bug I planted on purpose and the test that caught it.
- Part 4's PRs are in the other repos.

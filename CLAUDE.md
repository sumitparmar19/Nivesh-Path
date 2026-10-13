# Nivesh-Path - Project Context for Claude Code

## What this project is
**Behavioral Finance AI Platform - "the AI that knows YOUR trading DNA."**
Retail investors lose money mostly through behavioral biases (panic selling, FOMO buying,
overconcentration), not lack of information. Nivesh-Path studies each user's own trade history,
detects their patterns, and coaches them with evidence from it. Every feature should connect back
to that idea. Paper trading with $100k virtual cash; educational, not financial advice.

Owner: Sumit Parmar (MS CS @ UB, graduating Dec 2026, targeting SWE / Full-Stack / Backend / Data roles).
Live: https://nivesh-path-vzeak.ondigitalocean.app (custom domain pending) · Repo: sumitparmar19/Nivesh-Path

**Plan:** `docs/PHASE2_PLAN.md` (read its "Implementation notes" first - they override the plan text); Phase 3:
`docs/PHASE3_REVIEW.md` (decisions D1-D10, PR plan A-I) and the per-PR reports `docs/PHASE3_PR_*_REPORT.md`
(all of Part 1 together: `docs/PHASE3_FULL_REPORT.md`).
**History:** `docs/PHASE1_REPORT.md`.

## Current progress
- [x] Phase 1 - AI Portfolio Advisor, modular backend, Docker, CI, DigitalOcean deploy, site redesign
- [x] **Phase 2A** - per-user accounts (JWT on all trade/portfolio/AI routes), virtual $100k cash ledger,
      per-user ChromaDB collections, Stripe removed, Botpress removed
- [x] **ChromaDB persistence** - MongoDB is the source of truth; ai-service rebuilds Chroma from `purchases` on boot
      (`ai-service/startup.py`) + lazily per user; `behavioral_patterns` collection (`PatternStore`) for 2C results
- [x] **Feature UI** - `/portfolio.html` (cash, holdings, allocation, recent trades, AI memory panel; replaces the
      dashboard1 mock-up), `/whats-new.html` (release notes + live `/api/status`), AI memory strip on the advisor
- [x] **Audit sprints 1-3** (site audit decisions): fake/copied pages and other people's names removed, one shared
      layout, 12 ticker pages from one template + `/stock.html?symbol=` for any ticker, Markets/Watchlist/Account/Contact
      real; every user value saved to MongoDB (profile, settings, password, watchlist, analyses, contact, reset, delete);
      `/api/stocks/*` Finnhub data API (quote, profile, metrics, news, search, curated 50, candles)
- [x] **Phase 2B** - React 18 + TS + Tailwind app in `frontend/` (all 12 pages + `/stock/:symbol` for any ticker),
      served by Express with a staged rollout (`src/spa.js`, `REACT_DISABLED` rollback), Vitest (75) + Playwright smoke in CI
- [x] **Phase 2C Behavioral Mirror** - panic sell / FOMO buy / overconcentration detected after every trade (pure rules in
      `src/lib/behaviorRules.js`, events in `behavioral_events`), `/api/patterns`, AI coach, `/behavioral-mirror` page
- [x] **2C follow-up** (live-test fixes): FOMO needs a 5%+ run-up, no panic flag at/above cost, today's move counts, score
      over checked trades only, Advisor weights include cash, one Diversification formula, time-zone dates, AI_INTERNAL_TOKEN
- [x] **Phase 3 PR A** - Postgres ledger foundation (Prisma, ledger store interface, `FOR UPDATE`, Idempotency-Key,
      `LEDGER_MAINTENANCE`, token-only `/internal/trades*` read by the AI service, gitleaks full-history scan, MIT license);
      (live: Neon, PostgreSQL 18.6)
- [x] **Phase 3 PR B** - `scripts/migrate-ledger.js` (dry-run/migrate/verify/export-since) + `docs/LEDGER_CUTOVER.md`;
      What's new shows which ledger holds the money. **Live cutover done Oct 12, 2026: `LEDGER_BACKEND=postgres`**
      (verify "All users match (1)"; live status in `docs/PHASE3_LIVE_STATUS.md`)
- [x] **Phase 3 PR C+D** - OpenTelemetry in both services (off unless `OTEL_EXPORTER_OTLP_ENDPOINT`), redacting exporter,
      metrics + JSON logs with trace ids, Grafana dashboard + 3 alerts (`observability/`, `docs/OBSERVABILITY.md`);
      k6 read/trade mixes + `loadtest.yml` workflow (cache on vs `CACHE_DISABLED=1`), `docs/PERFORMANCE.md`
- [x] **Phase 3 PR E** (built; not applied yet - Sumit's AWS steps in `docs/AWS.md`) - Terraform `infra/bootstrap` (state
      bucket, GitHub OIDC deploy + read-only plan roles, permissions boundary, empty secrets, alert topic; run in CloudShell)
      and `infra/demo` (VPC without NAT, ALB, ECS Fargate web+ai, RDS, ECR, CloudWatch dashboard + 4 alarms, autoscaling
      1-3); workflows: Infra checks + plan comment, AWS demo apply/deploy/load test/destroy
- [x] **Phase 3 PR F** (built; AWS apply is Sumit's step, `docs/AWS.md` §8) - nightly job: EventBridge Scheduler (weekdays
      16:30 New York) -> Step Functions -> Lambda -> web's token-only `/internal/jobs/*` (held tickers, save daily close to
      Postgres `price_snapshots`, concentration check for every user); Behavioral Mirror rule v3 (5-day move from 6 saved
      closes, else Finnhub; `facts.fiveDaySource`). AWS holds only the internal token
- [x] **Full check of every page and feature** (`docs/PHASE3_LIVE_CHECK.md`): fixed delete-account landing on login and
      the page jump while loading (CLS); `frontend/e2e/live-smoke.spec.ts` + "Live smoke test" workflow for the real site
      (E2E_LIVE=1; never in normal CI); start-up line names the OTel service; 15-item UX list for Sumit
- [ ] **Phase 3** (plan: `docs/PHASE3_REVIEW.md`) - next · G pre-trade check + stress test (2D) · H+I agent + evals

## Layout
```
server.js            # Node entry: refuses to start in production without JWT_SECRET; Mongo; optional Sentry
frontend/            # React 18 + TS + Tailwind (Vite). src/pages (one per route), src/components, src/lib/api.ts (typed
                     #   client), src/types (API shapes), src/store (Zustand), src/config (FEATURED stocks, RELEASES);
                     #   tests in __tests__ (Vitest), e2e/smoke.spec.ts (Playwright, FAKE_MARKET_DATA), e2e/live-smoke.spec.ts
                     #   (real site, E2E_LIVE=1: new user, small orders, deletes it). Builds to frontend/dist
src/
  app.js             # createApp(deps) - Express app, deps injectable for tests
  spa.js             # serves frontend/dist: React routes + 301s from the legacy URLs they replace; REACT_DISABLED rollback
  lib/fakeMarket.js  # FAKE_MARKET_DATA=1 made-up prices for CI browser tests (refused in production); FOMO/DROP tickers
  lib/behaviorRules.js    # pure Behavioral Mirror rules (panic, FOMO, concentration, dedup, scores) - reuse in 2D
  lib/behaviorDetector.js # runs the rules after a trade, saves BehaviorEvent; trade waits <=1.5s, never fails;
                          #   marks Purchase.behaviorCheckedAt; checkPrices(): concentration from price moves (15 min)
  lib/behaviorMigration.js # start-up clean-up of events saved under older rules (ruleVersion < 2)
  routes/patterns.js      # /api/patterns (list, summary+scores, acknowledge, delete, insight, analyze)
  models/BehaviorEvent.js # collection `behavioral_events` (NOT behavioral_patterns: that is the AI's PatternStore)
  config.js          # env config, STOCKS list, toSymbol() name->ticker
  middleware/auth.js # requireAuth (401) / optionalAuth - req.user = { id, email }
  lib/ledger.js      # virtual cash ledger: validates + prices orders, summary/holdings/reset; LEDGER_MAINTENANCE -> 503
  lib/ledgerStore.js # picks the store for LEDGER_BACKEND (mongo default | postgres); every trade/cash read goes through it
  lib/ledgerStore.mongo.js # User.cashBalance + `purchases` (per-user in-process lock) - rollback path until retired
  lib/ledgerStore.pg.js    # Prisma: accounts + trades, SELECT ... FOR UPDATE per order, idempotency, Decimal money
  lib/db.js          # lazy shared PrismaClient
  lib/ledgerMigration.js # MongoDB -> Postgres move: plan (pure), apply (repeat-safe), verify (to the cent), tradesSince
  telemetry.js       # OpenTelemetry (loaded first by server.js); off unless OTEL_EXPORTER_OTLP_ENDPOINT; redacting exporter
  lib/metrics.js     # app metrics (http duration by route template, trades, detections, cache, AI calls, ai_service_up)
  lib/logger.js      # pino JSON logs (trace ids, scrubbed) - use logger, not console; lib/redact.js scrubbing rules
  routes/internal.js # /internal/trades/users, /internal/trades?userId= - X-Internal-Token only (404 otherwise), for the AI
prisma/              # schema.prisma + migrations (CHECK constraints are hand-added in migration SQL); `npx prisma migrate dev`
  lib/               # cache (Redis or memory), quotes (Finnhub), portfolio math, aiClient
  models/User.js     # users (bcryptjs hash, cashBalance, totalDeposited)
  routes/            # stocks (/api/stocks/*), purchases (trades, portfolio, reset), auth, account (/api/me*),
                     #   watchlist, contact, ai (proxy + history)
  lib/marketData.js  # Finnhub: quote, profile, metrics, news, search, candles (cached); CURATED list in config.js
  lib/mailer.js      # Resend email (optional)
  models/            # User (+settings), Analysis, Watchlist, Message
models/Stock1.js     # Trade model "Purchase": userId, name(=ticker), price, quantity, total, transactionType, idempotencyKey
public/              # LEGACY static UI (rollback while React is live; its URLs 301 to React routes): search.html (Markets), <TICKER>.html stock pages (generated),
                     #   stock.html?symbol= (any ticker), portfolio, transactions, advisor, watchlist, whats-new
public/psk/pages/    # about (+FAQ), contect (contact form), login, signup, user-dashboard (Account)
scripts/             # gen-stock-pages.py + stock-page.template.html (regenerate the 12 stock pages), check-finnhub.js,
                     #   migrate-ledger.js (cutover tool, see docs/LEDGER_CUTOVER.md), db-check.js (Postgres check)
public/assets/       # nivesh.css, nivesh.js (shared navbar/sidebar/footer, toasts, NP.authFetch, NP.stocks), trade.js,
                     #   stock-page.js (all stock pages), stock.css
public/psk/          # landing (index.html), about, contact, login/signup, account (served at /psk/...)
ai-service/          # Python FastAPI AI service (port 8001, internal only)
  services/llm_service.py         # LangChain prompt + Anthropic SDK structured output
  services/vector_service.py      # ChromaDB RAG, one collection per user (transactions_user_<id>) - a cache only
  services/mongo_store.py         # MongoDB: TradeStore (reads purchases) + PatternStore (behavioral_patterns)
  services/web_trades.py          # HttpTradeStore: trades from Node /internal (used when WEB_INTERNAL_URL + token set)
  startup.py                      # cold-start rebuild of ChromaDB from MongoDB (runs at boot)
  services/portfolio_analytics.py # deterministic metrics + rule-based fallback
tests/app.test.js    # Jest + Supertest (isolation, auth, ledger, AI proxy, idempotency, maintenance, /internal)
observability/       # grafana-dashboard.json, alert-rules.yaml (queries checked against Prometheus fed by the app)
loadtest/            # k6 read-mix.js, trade-mix.js, report.js; docker-compose.loadtest.yml; .github/workflows/loadtest.yml
infra/               # Terraform (docs/AWS.md): bootstrap/ (once, CloudShell: cloudshell.sh), demo/ (AWS demo stack),
                     #   jobs/ (nightly job: Scheduler -> Step Functions -> lambda/index.js -> web /internal/jobs/*),
                     #   scripts/deploy.sh (build -> migrate task -> roll out), checkov/ (custom rule: roles need the boundary)
  lib/dbUrl.js       # (src/lib) DATABASE_URL from DB_HOST/DB_USER/DB_PASSWORD (RDS); scripts/with-db-url.js wraps a command
  lib/priceSnapshots.js # (src/lib) daily closes: closeFromQuote (which trading day, never intraday), Postgres + memory stores
tests/ledger.pg.test.js # real Postgres (TEST_DATABASE_URL; CI sets it): constraints, 20 parallel buys, idempotency, reset
ai-service/tests/    # pytest
docs/                # PHASE1_REPORT.md, PHASE2_PLAN.md, DEPLOYMENT.md
```

## Key endpoints (all `/api/*` trade, portfolio and AI routes require `Authorization: Bearer <jwt>`)
- `POST /api/register` (returns token) · `POST /api/login` (mobile or email) · `GET /api/me`
- `POST /api/store-purchase` (aliases `/store-purchase`, `/api/trades`): `{symbol, quantity, price, type: "BUY"|"SELL"}`
  -> `{success, newBalance, transaction}`; server prices from Finnhub, 400 on insufficient funds / not enough shares /
  non-whole quantity; optional `Idempotency-Key` header (8-100 of `[A-Za-z0-9_-]`): the same order again returns 200
  `replayed: true`; the same key with a different order (ticker/side/shares) is 422
- `GET /internal/trades/users` · `GET /internal/trades?userId=` - service-to-service, `X-Internal-Token` only (404 otherwise)
- Nightly job (same token): `GET /internal/jobs/held-tickers` · `POST /internal/jobs/snapshots/:symbol` (saves that day's
  close after 4 pm New York; skipped while the market is open) · `POST /internal/jobs/concentration-check` (all users)
- `GET /api/transactions` · `GET /api/portfolio/holdings` · `GET /api/portfolio/cash-balance` (cash, holdings value, total P&L)
- `POST /api/ai/analyze-portfolio` -> FastAPI with `user_id`; `POST /api/ai/transactions` (FastAPI) indexes trades per user
- `GET /api/ai/memory` (trades in Mongo vs indexed in Chroma) · `POST /api/ai/memory/rebuild` (re-index caller's trades)
- `GET /api/status` - public: web, db, AI service, model, memory-rebuild status (no user data)
- Account: `PATCH /api/me` · `GET/PATCH /api/me/settings` · `POST /api/me/password` · `GET /api/me/avatar` · `DELETE /api/me`
  ({password, confirm:"DELETE"}) · `POST /api/portfolio/reset` ({confirm:"RESET"}) · `GET/POST/DELETE /api/watchlist`
- `GET /api/ai/history` · `GET /api/ai/history/:id` (every analysis is saved) · `POST /api/contact` (public, rate-limited)
- Behavioral Mirror: `GET /api/patterns?type=&severity=&acknowledged=&limit=` (max 100) · `GET /api/patterns/summary` (counts,
  unread, scores) · `PATCH /api/patterns/:id/acknowledge` · `POST /api/patterns/acknowledge-all` · `DELETE /api/patterns/:id`
  · `GET /api/patterns/insight` (last saved) · `POST /api/patterns/analyze` -> FastAPI `POST /api/ai/behavior/{user_id}`;
  trade responses include `behavior: [...]` (or null if detection took >1.5s)
- Public data: `GET /api/stocks/curated|search?q=|quotes?symbols=` · `GET /api/stocks/:symbol/quote|profile|metrics|news|candles`
- `GET /search` - public cached quotes for the 12 featured stocks · `DELETE /api/ai/history/:id`
- Page URLs (`/portfolio`, `/stock/:symbol`, ...) belong to the React app - never add a non-`/api` GET route that clashes

## Stack
- Frontend: React 18, TypeScript (strict), Tailwind 3, Vite 5, React Router 6, TanStack Query 5, Zustand, Recharts, Vitest,
  Playwright; legacy static HTML in `public/` kept as rollback
- Backend: Node 22, Express 4, MongoDB (Mongoose), Redis cache (optional), JWT (jsonwebtoken + bcryptjs), Helmet, rate limiting
- AI: FastAPI, LangChain (`langchain-core`), Anthropic Python SDK, ChromaDB; model from `CLAUDE_MODEL` (now `claude-opus-5-5`)
- Ledger (Phase 3): Postgres 18 everywhere (Neon 18.6 in production; CI, docker-compose and the AWS RDS demo on 18) via Prisma 6.19.3 (`binaryTargets` include musl for Alpine)

## Commands
- Backend: `npm install && npm run dev` (port 3000; `npm install` runs `prisma generate`); tests `npm test`
  (Postgres suites: `DATABASE_URL=$U DIRECT_URL=$U npx prisma migrate deploy && TEST_DATABASE_URL=$U npm test` with a
  disposable database `$U`; Jest runs files one at a time because they share it); `node scripts/db-check.js`
- Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies /api to :3000); `npm test`, `npm run typecheck`,
  `npm run build` (Express then serves it on :3000); `npm run e2e` against a server started with `FAKE_MARKET_DATA=1`
- AI service: `cd ai-service && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/uvicorn main:app --port 8001`; tests `.venv/bin/pytest -q`
- Everything: `cp .env.example .env` then `docker compose up --build`
- Terraform (1.15.9): `terraform -chdir=infra/<stack> init -backend=false && terraform -chdir=infra/<stack> validate`;
  `terraform fmt -recursive infra`; Checkov: `checkov -d infra --framework terraform --external-checks-dir infra/checkov`

## Rules for Claude Code
- Every query on trades/portfolio MUST filter by `req.user.id`; every new trade/portfolio/AI route uses `requireAuth`
- Cash and trades change only through `src/lib/ledger.js` -> the ledger store (Mongo: atomic `$inc`; Postgres: one
  transaction with `FOR UPDATE` on the account). Never query `Purchase`/`prisma.trade` from a route: use `ledger.store`
- Ledger schema change: edit `prisma/schema.prisma`, `npx prisma migrate dev --name <what>`, add CHECKs by hand in the SQL;
  CI fails if the schema and migrations disagree. Money columns are NUMERIC; quantities are whole shares
- `/internal/*` is reachable from the internet: token-only, and every route there stays read-only unless reviewed
  (reviewed exceptions: `GET /internal/demo-fault`, only with `DEMO_FAULTS=1` (AWS demo stack); the nightly job's two
  POSTs, which write only `price_snapshots` and Behavioral Mirror events - PR B review Q1)
- AWS: no access keys anywhere (GitHub OIDC only); every IAM role a stack creates is named `nivesh-demo-*`/`nivesh-jobs-*`
  and sets `permissions_boundary` (Checkov rule CKV2_NIVESH_1); secret VALUES never go into Terraform (empty secrets,
  typed by Sumit); every Checkov finding is fixed or skipped inline with a reason; tag everything via provider default_tags
- Telemetry: never put JWTs, keys, emails or bodies into spans, metric labels or logs; metric labels stay low-cardinality
  (route templates, never raw URLs or user ids); new metrics go in `src/lib/metrics.js` and on the dashboard
- Python: type hints everywhere; FastAPI endpoints have docstrings (+ response_model)
- All new code has error handling; external services (Claude, Finnhub, Redis, AI service) must fail gracefully
- Every new file starts with a brief comment explaining what it does and why it exists
- Never hardcode API keys - environment variables only; `.env` is git-ignored, update `.env.example`
- Keep commits small and descriptive; run `npm test` and `pytest` before pushing; never break CI
- Durable AI data (coach insight, per-type summaries) goes to MongoDB via `PatternStore`; ChromaDB is wiped on every deploy.
  Per-trade detections are `BehaviorEvent`s written by Node - never write them into `behavioral_patterns` (unique index)
- Market data for detectors comes from `marketData.momentum()` (basic financials: 52w high, 5-day return) plus the live
  quote (today's change, intraday high); candles are not on the free Finnhub plan
- Changing a Behavioral Mirror rule: bump `RULE_VERSION` in `behaviorRules.js` so the start-up clean-up re-grades old events
  (now v3: the 5-day move comes from our own `price_snapshots` once 6 recent closes exist, else Finnhub)
- Portfolio weights shown anywhere (Advisor, Mirror, Portfolio) are shares of the WHOLE account (cash + holdings);
  Diversification = 100 - largest stock's share of the account, computed in code (Node `behaviorRules.diversification`,
  Python `portfolio_analytics.diversification_score`) - never by the LLM
- AI prompts must say the account is paper trading (no taxes/fees); dates shown to users use the browser's time zone
- Don't do arithmetic in the LLM - compute numbers in code and pass them in
- Signing out on purpose from a signed-in page: navigate to "/" with `state: { signedOut: true }` (PublicLayout finishes
  it) - signing out first lets RequireAuth bounce the user to /login; `beginSignOut()` stops a late 401 from redirecting
- UI: new UI work goes in `frontend/` (React). Types in `src/types` must match the real API; API calls only through
  `src/lib/api.ts`; >= 5 Vitest tests per page; new release notes go in `frontend/src/config/releases.ts`
- Legacy pages (rollback only): pages include fonts + `/assets/nivesh.css` in <head> and `/assets/nivesh.js` (defer) before </body>;
  navbar/sidebar/footer are placeholders (`data-np-nav`, `data-np-sidebar`, `data-np-footer`) filled by nivesh.js - never
  copy menu or footer markup into a page; protected calls use `NP.authFetch`; link to stocks with `NP.stockUrl(symbol)`
- Stock pages: edit `scripts/stock-page.template.html` and run `python3 scripts/gen-stock-pages.py`; never hand-edit `<TICKER>.html`
- No fake content: no placeholder people, testimonials, numbers, prices or links to `#`; a button must do something or not exist
- Store trades by ticker (AAPL, TSLA...), never company names
- Every shipped feature must be visible in the UI and get an entry on What's new (`frontend/src/config/releases.ts`)
- At the end of a session, update "Current progress" above and the notes in `docs/PHASE2_PLAN.md`

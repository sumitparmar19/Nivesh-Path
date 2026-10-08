# Nivesh-Path - Project Context for Claude Code

## What this project is
**Behavioral Finance AI Platform - "the AI that knows YOUR trading DNA."**
Retail investors lose money mostly through behavioral biases (panic selling, FOMO buying,
overconcentration), not lack of information. Nivesh-Path studies each user's own trade history,
detects their patterns, and coaches them with evidence from it. Every feature should connect back
to that idea. Paper trading with $100k virtual cash; educational, not financial advice.

Owner: Sumit Parmar (MS CS @ UB, graduating Dec 2026, targeting SWE / Full-Stack / Backend / Data roles).
Live: https://nivesh-path-vzeak.ondigitalocean.app (custom domain pending) · Repo: sumitparmar19/Nivesh-Path

**Plan:** `docs/PHASE2_PLAN.md` (read its "Implementation notes" first - they override the plan text).
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
- [ ] **2D Pre-trade check + stress test - next** (reuse `behaviorRules` before the trade) · 2E news + AI chat · 2F cloud

## Layout
```
server.js            # Node entry: refuses to start in production without JWT_SECRET; Mongo; optional Sentry
frontend/            # React 18 + TS + Tailwind (Vite). src/pages (one per route), src/components, src/lib/api.ts (typed
                     #   client), src/types (API shapes), src/store (Zustand), src/config (FEATURED stocks, RELEASES);
                     #   tests in __tests__ (Vitest), e2e/smoke.spec.ts (Playwright). Builds to frontend/dist
src/
  app.js             # createApp(deps) - Express app, deps injectable for tests
  spa.js             # serves frontend/dist: React routes + 301s from the legacy URLs they replace; REACT_DISABLED rollback
  lib/fakeMarket.js  # FAKE_MARKET_DATA=1 made-up prices for CI browser tests (refused in production); FOMO/DROP tickers
  lib/behaviorRules.js    # pure Behavioral Mirror rules (panic, FOMO, concentration, dedup, scores) - reuse in 2D
  lib/behaviorDetector.js # runs the rules after a trade, saves BehaviorEvent; trade waits <=1.5s, never fails
  routes/patterns.js      # /api/patterns (list, summary+scores, acknowledge, delete, insight, analyze)
  models/BehaviorEvent.js # collection `behavioral_events` (NOT behavioral_patterns: that is the AI's PatternStore)
  config.js          # env config, STOCKS list, toSymbol() name->ticker
  middleware/auth.js # requireAuth (401) / optionalAuth - req.user = { id, email }
  lib/ledger.js      # virtual cash ledger: atomic buy/sell, per-user lock, portfolio summary
  lib/               # cache (Redis or memory), quotes (Finnhub), portfolio math, aiClient
  models/User.js     # users (bcryptjs hash, cashBalance, totalDeposited)
  routes/            # stocks (/api/stocks/*), purchases (trades, portfolio, reset), auth, account (/api/me*),
                     #   watchlist, contact, ai (proxy + history)
  lib/marketData.js  # Finnhub: quote, profile, metrics, news, search, candles (cached); CURATED list in config.js
  lib/mailer.js      # Resend email (optional)
  models/            # User (+settings), Analysis, Watchlist, Message
models/Stock1.js     # Trade model "Purchase": userId, name(=ticker), price, quantity, total, transactionType
public/              # LEGACY static UI (rollback while React is live; its URLs 301 to React routes): search.html (Markets), <TICKER>.html stock pages (generated),
                     #   stock.html?symbol= (any ticker), portfolio, transactions, advisor, watchlist, whats-new
public/psk/pages/    # about (+FAQ), contect (contact form), login, signup, user-dashboard (Account)
scripts/             # gen-stock-pages.py + stock-page.template.html (regenerate the 12 stock pages), check-finnhub.js
public/assets/       # nivesh.css, nivesh.js (shared navbar/sidebar/footer, toasts, NP.authFetch, NP.stocks), trade.js,
                     #   stock-page.js (all stock pages), stock.css
public/psk/          # landing (index.html), about, contact, login/signup, account (served at /psk/...)
ai-service/          # Python FastAPI AI service (port 8001, internal only)
  services/llm_service.py         # LangChain prompt + Anthropic SDK structured output
  services/vector_service.py      # ChromaDB RAG, one collection per user (transactions_user_<id>) - a cache only
  services/mongo_store.py         # MongoDB: TradeStore (reads purchases) + PatternStore (behavioral_patterns)
  startup.py                      # cold-start rebuild of ChromaDB from MongoDB (runs at boot)
  services/portfolio_analytics.py # deterministic metrics + rule-based fallback
tests/app.test.js    # Jest + Supertest (isolation, auth, ledger, AI proxy)
ai-service/tests/    # pytest
docs/                # PHASE1_REPORT.md, PHASE2_PLAN.md, DEPLOYMENT.md
```

## Key endpoints (all `/api/*` trade, portfolio and AI routes require `Authorization: Bearer <jwt>`)
- `POST /api/register` (returns token) · `POST /api/login` (mobile or email) · `GET /api/me`
- `POST /api/store-purchase` (aliases `/store-purchase`, `/api/trades`): `{symbol, quantity, price, type: "BUY"|"SELL"}`
  -> `{success, newBalance, transaction}`; server prices from Finnhub, 400 on insufficient funds / not enough shares
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

## Commands
- Backend: `npm install && npm run dev` (port 3000); tests `npm test`
- Frontend: `cd frontend && npm install && npm run dev` (port 5173, proxies /api to :3000); `npm test`, `npm run typecheck`,
  `npm run build` (Express then serves it on :3000); `npm run e2e` against a server started with `FAKE_MARKET_DATA=1`
- AI service: `cd ai-service && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/uvicorn main:app --port 8001`; tests `.venv/bin/pytest -q`
- Everything: `cp .env.example .env` then `docker compose up --build`

## Rules for Claude Code
- Every query on trades/portfolio MUST filter by `req.user.id`; every new trade/portfolio/AI route uses `requireAuth`
- Cash changes only through `src/lib/ledger.js` (atomic `$inc`, never read-modify-write)
- Python: type hints everywhere; FastAPI endpoints have docstrings (+ response_model)
- All new code has error handling; external services (Claude, Finnhub, Redis, AI service) must fail gracefully
- Every new file starts with a brief comment explaining what it does and why it exists
- Never hardcode API keys - environment variables only; `.env` is git-ignored, update `.env.example`
- Keep commits small and descriptive; run `npm test` and `pytest` before pushing; never break CI
- Durable AI data (coach insight, per-type summaries) goes to MongoDB via `PatternStore`; ChromaDB is wiped on every deploy.
  Per-trade detections are `BehaviorEvent`s written by Node - never write them into `behavioral_patterns` (unique index)
- Market data for detectors comes from `marketData.momentum()` (basic financials: 52w high, 5-day return); candles are
  not on the free Finnhub plan
- Don't do arithmetic in the LLM - compute numbers in code and pass them in
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

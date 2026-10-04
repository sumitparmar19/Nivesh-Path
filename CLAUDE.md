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
- [ ] **Phase 2B - next:** React 18 + TypeScript + Tailwind migration of 5 core pages (+ dynamic `/stock/:symbol`)
- [ ] 2C Behavioral Mirror · 2D Pre-trade check + stress test · 2E news pipeline + AI chat · 2F cloud/observability

## Layout
```
server.js            # Node entry: refuses to start in production without JWT_SECRET; Mongo; optional Sentry
src/
  app.js             # createApp(deps) - Express app, deps injectable for tests
  config.js          # env config, STOCKS list, toSymbol() name->ticker
  middleware/auth.js # requireAuth (401) / optionalAuth - req.user = { id, email }
  lib/ledger.js      # virtual cash ledger: atomic buy/sell, per-user lock, portfolio summary
  lib/               # cache (Redis or memory), quotes (Finnhub), portfolio math, aiClient
  models/User.js     # users (bcryptjs hash, cashBalance, totalDeposited)
  routes/            # stocks (quotes), purchases (trades + portfolio), auth (register/login/me), ai (proxy)
models/Stock1.js     # Trade model "Purchase": userId, name(=ticker), price, quantity, total, transactionType
public/              # static UI served by Express (company pages, markets, transactions, advisor,
                     #   portfolio.html dashboard, whats-new.html release notes + live status)
public/assets/       # design system on EVERY page: nivesh.css, nivesh.js (toasts, NP.authFetch session helpers), trade.js
public/psk/          # marketing site + login/signup (served at /psk/...)
psk/                 # older copy of marketing site + bolt React/TS starter (NOT served)
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
- `GET /search`, `GET /stock/:symbol` - public cached Finnhub quotes (key never sent to the browser)

## Stack
- Frontend: static HTML/CSS/JS + design system (React/TS migration is Phase 2B)
- Backend: Node 22, Express 4, MongoDB (Mongoose), Redis cache (optional), JWT (jsonwebtoken + bcryptjs), Helmet, rate limiting
- AI: FastAPI, LangChain (`langchain-core`), Anthropic Python SDK, ChromaDB; model from `CLAUDE_MODEL` (now `claude-opus-5-5`)

## Commands
- Backend: `npm install && npm run dev` (port 3000); tests `npm test`
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
- Durable AI data (behavioral patterns etc.) goes to MongoDB via `PatternStore`; ChromaDB is wiped on every deploy
- Don't do arithmetic in the LLM - compute numbers in code and pass them in
- UI (until React): pages include fonts + `/assets/nivesh.css` in <head> and `/assets/nivesh.js` (defer) before </body>;
  protected calls use `NP.authFetch`; stock pages set `<body data-symbol="TICKER">` and load `/assets/trade.js`
- Store trades by ticker (AAPL, TSLA...), never company names
- Every shipped feature must be visible in the UI and get an entry on `public/whats-new.html`
- At the end of a session, update "Current progress" above and the notes in `docs/PHASE2_PLAN.md`

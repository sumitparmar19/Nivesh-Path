# Nivesh-Path v2 - Project Context for Claude Code

## What this project is
Full-stack stock-investing platform being upgraded to production grade with AI
features, as a portfolio project. Owner: Sumit Parmar (MS CS @ UB, graduating
Dec 2026, targeting SWE / Full-Stack roles). Every change should show AI
features, cloud, CI/CD and a professional developer workflow.

## Layout (actual)
```
server.js            # Node entry: Mongo connect, optional Sentry, listen
demo.js              # legacy shim -> require("./server")
src/
  app.js             # createApp(deps) - Express app, deps injectable for tests
  config.js          # env config, STOCKS list, legacy checkout slugs
  lib/               # cache (Redis or memory), quotes (Finnhub), portfolio math, aiClient
  models/User.js     # users (bcryptjs hashes)
  routes/            # stocks, checkout (Stripe), purchases, auth (JWT), ai (proxy)
models/Stock1.js     # Purchase model (transactions) - still used
public/              # static UI served by Express (company pages, dashboard, advisor.html)
public/assets/       # design system loaded on EVERY page: nivesh.css (tokens, layout, components, motion),
                     # nivesh.js (mobile menu, toasts replacing alert, scroll reveal, price flashes), trade.js (Buy/Sell)
public/psk/          # marketing site + login/signup (served at /psk/...)
psk/                 # older copy of the marketing site + bolt React/TS starter (NOT served)
ai-service/          # Python FastAPI AI advisor (port 8001)
  main.py, config.py, schemas.py
  services/llm_service.py        # LangChain prompt + Anthropic SDK structured output
  services/vector_service.py     # ChromaDB RAG over transactions (local hashing embeddings)
  services/portfolio_analytics.py# deterministic metrics + rule-based fallback
tests/               # Jest + Supertest (backend)
ai-service/tests/    # pytest (AI service)
docker-compose.yml, Dockerfile, ai-service/Dockerfile
.github/workflows/ci.yml   # tests -> docker build -> push to GHCR on main
.do/app.yaml               # DigitalOcean App Platform deploy spec
architecture.md
```

## Stack
- Frontend: static HTML/CSS/JS in `public/` (React + TS + Tailwind starter in `psk/src` is not wired up yet)
- Backend: Node 22 + Express 4, MongoDB (Mongoose), Redis cache (optional), Stripe Checkout, JWT auth
- AI: FastAPI + LangChain (`langchain-core` prompts/documents) + Anthropic Python SDK + ChromaDB
- Model: `claude-opus-5-5` (env `CLAUDE_MODEL`), effort `medium`, server-side refusal fallback (`fallbacks="default"`)

## Key endpoints
- `POST /api/ai/analyze-portfolio` (Node) -> enriches holdings with live quotes -> `POST /api/ai/analyze-portfolio` (FastAPI)
- `POST /api/ai/transactions` (FastAPI) - index transactions for RAG (Node calls it after each purchase)
- `GET /search`, `GET /stock/:symbol` - cached Finnhub quotes (key never sent to the browser)
- `POST /create-checkout-session[-<company>]` - Stripe (sends symbol/quantity/price; metadata on the session)
- `POST /api/checkout/confirm` - transactions.html calls it with `?session_id`; records the buy only if Stripe says paid (idempotent)
- `POST /store-purchase`, `GET /transactions`, `GET /api/portfolio/holdings`
- `POST /api/register`, `POST /api/login` (returns JWT)

## Commands
- Backend: `npm install && npm run dev` (port 3000); tests `npm test`
- AI service: `cd ai-service && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/uvicorn main:app --port 8001`; tests `.venv/bin/pytest -q`
- Everything: `cp .env.example .env` then `docker compose up --build`

## Roadmap
- [x] Phase 1 - Portfolio AI Advisor (FastAPI, LangChain, Claude, ChromaDB RAG, advisor.html)
- [x] Phase 2 - Docker Compose, GitHub Actions CI, Sentry hooks (set `SENTRY_DSN`)
- [~] Phase 3 - pytest + Jest done; Playwright E2E still to add
- [~] Phase 4 - Deploy spec ready (`.do/app.yaml`); needs DigitalOcean account + secrets, then put live URL in README
- [ ] Per-user transactions (purchases are not linked to users yet - `user_id` is "anonymous")
- [ ] New Relic APM, streaming AI responses, migrate UI to the React/TS app

## Rules for Claude Code
- Python: type hints everywhere; FastAPI endpoints have docstrings
- All new code has error handling; external services (Claude, Finnhub, Stripe, Redis, AI service) must fail gracefully
- Every new file starts with a brief comment explaining what it does
- Never hardcode API keys - environment variables only; `.env` is git-ignored, update `.env.example`
- Keep commits small and descriptive; run `npm test` and `pytest` before pushing
- Don't do arithmetic in the LLM - compute numbers in code and pass them in
- UI: new pages must include fonts + `/assets/nivesh.css` in <head> and `/assets/nivesh.js` (defer) before </body>;
  stock pages also set `<body data-symbol="TICKER">` and load `/assets/trade.js`. Use `np-*` classes, not new one-off CSS.
- Store trades by ticker (AAPL, TSLA...), never company names

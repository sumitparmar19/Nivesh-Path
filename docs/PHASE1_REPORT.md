# Nivesh-Path v2 - Phase 1 Report

**Project:** Nivesh-Path, an AI-powered stock investing platform (portfolio project)
**Owner:** Sumit Parmar (MS CS @ University at Buffalo, graduating Dec 2026, targeting SWE / Full-Stack roles)
**Repository:** https://github.com/sumitparmar19/Nivesh-Path (branch `main`)
**Live site:** https://nivesh-path-vzeak.ondigitalocean.app
**Period covered:** Oct 3-4, 2026, built with Claude Code
**Status:** Phase 1 is complete and deployed. The app is live, CI is green, and 30 automated tests pass.

---

## 1. Starting point (what the repo looked like before)

- **Backend:** a single 900-line `demo.js` (Express).
  - Stripe checkout was copy-pasted into 12 near-identical routes.
  - There was no auth backend: the frontend called `/api/login`, `/api/register` and `/transactions`, which didn't exist.
- **Security:**
  - The real Stripe secret key, MongoDB URL and Finnhub key were committed in `.env`.
  - A MongoDB username and password were hardcoded in a browser-served JS file (`public/client.js`).
  - The Finnhub key was sent to every browser via `/api/get-api-key`.
- **Repo hygiene:** `node_modules/` was committed, and the `bcrypt` binary in it was Windows-only, so it crashed on Linux.
- **Hardcoded URLs:** the frontend called `http://localhost:3000` everywhere, so it couldn't work when deployed.
- **Buy/Sell bugs:**
  - One Buy click fired 3 handlers: a **fixed $50** Stripe checkout, a checkout for the real total, and a purchase record saved **before** payment.
  - Sell charged a fixed **$30** card payment.
  - The Uber page saved its trades as "Nike".
  - Trades were stored by company name, not ticker.
- **UI quality:**
  - 14 pages overflowed sideways on desktop and 20 on phones.
  - There were **920 JavaScript errors** across the pages.
  - 3 links were broken and 4 referenced files were missing.
  - Fonts and sizes were inconsistent, and the footers carried "© Groww" branding from a real company.
- **Leftover old accounts:** a Stripe publishable key, a Font Awesome kit and a Botpress bot all belonged to a previous teammate's accounts.
- **No AI features, no tests, no CI, no Docker, no deployment.**

---

## 2. What was built

### 2.1 Architecture

```
Browser (public/*.html + design system)
   │
   ▼
Node.js / Express API  (:3000)  ──► MongoDB Atlas (users, transactions)
   │   ├─ Redis or in-memory cache ──► Finnhub (live quotes, key stays server-side)
   │   ├─ Stripe Checkout (verified payments)
   │   └─ JWT auth (bcryptjs)
   ▼
Python FastAPI AI service (:8001, internal only)
   ├─ ChromaDB vector store (RAG over the user's trade history)
   └─ Claude API (claude-opus-5-5) via Anthropic SDK + LangChain prompts
```

There are two deployable services, each with its own Dockerfile. Diagrams are in `architecture.md`.

### 2.2 AI Portfolio Advisor (`ai-service/`): the headline AI feature
- **Stack:** FastAPI, Pydantic, LangChain (`ChatPromptTemplate` and `Document`), the Anthropic Python SDK and ChromaDB.
- **`POST /api/ai/analyze-portfolio`:**
  1. Computes **deterministic metrics in Python**: P/L, position weights and HHI concentration. The LLM never does arithmetic.
  2. Retrieves the user's most relevant past trades from **ChromaDB** (RAG).
  3. Calls **Claude** with **structured output** validated against an `AIInsight` Pydantic schema. The schema covers summary, risk level, diversification score, strengths, risks, recommendations and an answer to the user's question.
  4. Uses a **server-side refusal fallback** (`fallbacks="default"`) and a chain of typed error handlers.
  5. **Degrades gracefully:** with no API key, an outage, a rate limit or a refusal, it returns a rule-based analysis built from the same metrics, so the page never breaks.
- **`POST /api/ai/transactions`** embeds every new trade into ChromaDB. The embeddings come from a local hashing vectorizer, so no extra API key is needed.
- **Frontend:** `advisor.html`. It loads holdings from your transactions, lets you add or edit holdings, takes a risk profile and an optional question, and shows a results dashboard with an "AI insight · model" badge.
- **Cost protection:** the endpoint is rate-limited to 10 requests per minute per client.

### 2.3 Backend refactor (Node.js / Express)
- The `demo.js` monolith became `server.js` plus a modular `src/` (routes, libs, models). Dependencies are injectable, so tests can fake Mongo, Stripe, Finnhub and the AI service.
- **Endpoints:**
  - **Market data:** `/search` and `/stock/:symbol` return cached Finnhub quotes (Redis if configured, else in-memory, 60s TTL).
  - **Auth:** `POST /api/register` and `POST /api/login`, with bcryptjs hashing and 7-day JWTs. Duplicate email or mobile returns 409.
  - **Trades:** `POST /store-purchase` (also `/api/store-purchase`), `GET /transactions` and `GET /api/portfolio/holdings`. Holdings are netted from buys and sells at average cost.
  - **Payments:** `POST /create-checkout-session` replaces 12 duplicated routes; the legacy URLs still work. `POST /api/checkout/confirm` is described in 2.4.
  - **AI proxy:** `POST /api/ai/analyze-portfolio` enriches holdings with live prices, then calls the AI service.
- **Hardening:**
  - Helmet security headers and a JSON body limit.
  - A central error handler.
  - Optional Sentry error tracking.
  - Configuration comes from environment variables only.

### 2.4 Correct trading flow (payments verified by Stripe)
- **Buy:**
  1. Clicking Buy validates the quantity and opens **one** Stripe Checkout for quantity × price, with ticker, quantity and price stored in session metadata.
  2. Stripe returns to `/transactions.html?session_id=…`.
  3. The server calls Stripe, checks `payment_status === "paid"`, and only then records the buy, **exactly once**: a unique `stripeSessionId` prevents double-recording.
- **Sell:** the server checks that you own enough shares. If not, it answers with a clear message like "You own 2 TSLA shares, so you can't sell 3". Sells are recorded without charging a card.
- **Tickers:** all trades are stored by ticker. Legacy names like "Tesla" or "Goldman Sachs" are mapped to tickers automatically.
- **Demo mode:** if Stripe isn't configured, buys are recorded as demo trades, so the app still works without keys.

### 2.5 Security cleanup
- Stopped tracking `.env` and `node_modules`, and added `.gitignore` and `.env.example`.
- Removed the hardcoded MongoDB credentials from `public/client.js`.
- Removed the Finnhub key from the browser; all quotes go through the server.
- Removed the previous owner's Stripe publishable key; the pages no longer need it.
- Replaced the previous owner's Font Awesome kit with the public CDN.
- Created **new accounts in Sumit's name**: MongoDB Atlas, Stripe (test mode), Finnhub and Anthropic. All keys live only in DigitalOcean encrypted environment variables.
- **Note:** the old keys are still in git history. They belong to the previous teammate's accounts, which are no longer used.

### 2.6 UI/UX redesign (all 29 pages)
- **Shared design system** in `public/assets/`, loaded on every page:
  - **`nivesh.css`:**
    - design tokens (brand green, slate neutrals, radii, shadows) and Inter + Plus Jakarta Sans typography with tabular numbers;
    - a sticky glass navbar that becomes a hamburger menu on phones, and a sidebar that becomes swipeable chips on phones;
    - a CSS Grid stock page with a sticky trade panel;
    - shared cards, buttons, forms, footer, pricing, auth and dashboard styles;
    - dark mode and reduced-motion support.
  - **`nivesh.js`:**
    - toasts instead of `alert()`, kept across page navigation;
    - current-page highlighting and scroll-reveal animations;
    - loading skeletons, and live prices that flash green or red when they change.
  - **`trade.js`:** the single Buy/Sell handler.
- **Rebuilt pages:**
  - Transactions: wallet, bought and sold cards, Buy/Sell filters, symbol search, an empty state and the payment confirmation.
  - Payment Success and Cancel pages.
  - The markets home page.
  - Pricing cards.
  - Login (now just mobile + password) and signup copy.
- "AI Advisor" was added to every navigation menu, and the "Groww" branding was replaced with Nivesh-Path.

**Audit results** (Playwright, every page at 1366px desktop and 390px phone):

| Problem | Before | After |
|---|---|---|
| Pages with horizontal overflow (desktop) | 14 | **0** |
| Pages with horizontal overflow (phone) | 20 | **1** (unlinked internal `demo.html`) |
| JavaScript errors | 920 | **0** |
| Broken links | 3 | **0** |
| Missing files (404) | 4 | **0** |

### 2.7 DevOps, testing and deployment
- **Docker:**
  - `Dockerfile` for the Node service and `ai-service/Dockerfile`; both run as non-root users and have health checks.
  - `docker-compose.yml` runs web, ai, MongoDB and Redis with one command.
- **CI, GitHub Actions** (`.github/workflows/ci.yml`): Jest, pytest and Docker image builds run on every push and PR. Images are pushed to GHCR on `main`.
- **Tests: 30 automated.**
  - **Backend, 20 Jest + Supertest tests:** health, checkout mapping, verified payment (paid once, unpaid rejected, bad session ID rejected), sell validation, ticker mapping, auth (hashing, JWT, duplicates), the AI proxy and quote caching.
  - **AI service, 10 pytest tests:** Claude mocked, ChromaDB in memory. They cover metrics, RAG per-user isolation, fallbacks on missing key, API error and refusal, and input validation.
  - Browser flow tests with Playwright covered Buy, Sell, the payment confirmation and transaction filters.
- **Deployment, DigitalOcean App Platform** (`.do/app.yaml`):
  - two components: `web` (public) and `ai` (internal only);
  - automatic deploy on every push to `main`;
  - secrets stored encrypted in the dashboard;
  - the database is MongoDB Atlas (free M0).
- **Docs:** `README.md`, `architecture.md`, `docs/DEPLOYMENT.md` (step-by-step setup of every account and key), and `CLAUDE.md` (project context and rules for Claude Code sessions).

### 2.8 Pull requests (all merged into `main`)
1. **#1:** AI Portfolio Advisor, modular backend, Docker and CI/CD.
2. **#2:** Removed the leaked credentials and the old Stripe key, replaced the copied branding, and added the setup guide.
3. **#3:** Fixed the app spec for the DigitalOcean dashboard.
4. **#4:** Site-wide redesign and the correct Buy/Sell flow with verified Stripe payments.

That's 15 commits, about 98 files changed, +11.1k / −2.9k lines (excluding `node_modules`).

---

## 3. Tech stack summary

| Layer | Technologies |
|---|---|
| Frontend | HTML, CSS (custom design system), vanilla JS, TradingView widgets, Chart.js |
| Backend | Node.js 22, Express 4, Mongoose, JWT, bcryptjs, Helmet, express-rate-limit, Redis client |
| AI | Python 3.11, FastAPI, Pydantic, LangChain, Anthropic SDK (Claude `claude-opus-5-5`), ChromaDB (RAG) |
| Data | MongoDB Atlas, ChromaDB, Redis (optional cache) |
| Payments | Stripe Checkout (test mode), with server-side payment verification |
| DevOps | Docker, Docker Compose, GitHub Actions, GHCR, DigitalOcean App Platform, Sentry hooks |
| Testing | Jest, Supertest, pytest, Playwright |

---

## 4. Known limitations (honest gaps for Phase 2)

1. **Transactions are not per user yet.** Login works and issues a JWT, but trades are stored globally, so everyone shares one portfolio. This is the most important gap.
2. **Protected routes:** the JWT is issued and optionally read, but no route *requires* it yet. The frontend keeps the session in `localStorage`.
3. **Only 12 stocks**, each with a hand-made HTML page. The 11 company pages are near-copies; there is no dynamic `/stock/:symbol` page or symbol search against the full market.
4. **Demo wallet:** the $100,000 balance is computed client-side. There is no real cash ledger, order types (limit/stop) or order book.
5. **Prices poll** every 60 seconds; there is no WebSocket streaming.
6. **RAG embeddings are lexical** (local hashing). A hosted semantic embedding model would improve retrieval.
7. **The AI responds all at once**, with no streaming.
8. **The frontend is still multi-page static HTML** with legacy per-page CSS underneath the design system. The React + TypeScript app in `psk/src` is not wired up.
9. **Playwright end-to-end tests are not in CI yet**, and New Relic and alerting are not set up.
10. **Leftover content:** sample data on `dashboard1.html`, the previous teammate's Botpress chatbot on the marketing home page (kept for now by choice), and a duplicate old `psk/` folder at the repo root.

---

## 5. Suggested Phase 2: make it a full-stack product, not just a website

### Must-have (core product)
- **Per-user accounts end to end:**
  - auth middleware on all trade and AI routes;
  - `userId` on transactions;
  - each user sees only their own portfolio;
  - refresh tokens or httpOnly cookies;
  - password reset by email.
- **Real portfolio engine:**
  - a server-side cash ledger with a transactions table;
  - realized and unrealized P/L;
  - daily portfolio value snapshots for a performance chart (1W/1M/1Y).
- **Dynamic stock pages:**
  - one template at `/stock/:symbol` for any ticker;
  - symbol search through the Finnhub search API;
  - company profile, news and financials from APIs instead of hardcoded HTML.
- **Watchlists and price alerts:** users save symbols and set alerts like "notify me if TSLA < $200", with email or push notifications from a background worker.
- **Real-time prices:** a WebSocket (Finnhub WebSocket → server → browser) instead of polling.

### AI features (resume differentiators)
- **AI chat assistant:** a streaming Claude chat that answers questions using tools such as get quote, get my holdings and get news, so it can act on live data.
- **News sentiment:** Claude summarizes and scores news per holding, shown on stock pages.
- **Semantic RAG:** real embeddings, with retrieval over the user's trades plus company filings and news.
- **AI evaluation:** a small eval set and a CI check for advisor answer quality.

### Engineering quality
- Migrate the UI to **React + TypeScript + Tailwind** (the starter already exists in `psk/src`), with routing, state management and component tests.
- **Playwright end-to-end tests in CI**; OpenAPI/Swagger docs for the Node API.
- **Observability:** Sentry DSN, New Relic APM, structured logs and an uptime monitor.
- **Background jobs** with a queue (BullMQ + Redis) for alerts, snapshots and AI ingestion.
- **Admin dashboard:** users, trades and AI usage/cost.
- A **custom domain** (free `.me` from the Student Pack) with HTTPS.

---

## 6. Resume-ready bullet points (Phase 1)

- Built **Nivesh-Path**, a full-stack investing platform (Node.js/Express, MongoDB, Stripe, Python/FastAPI), with a **Claude-powered AI Portfolio Advisor** that uses **RAG over ChromaDB** and **schema-validated structured outputs**. It falls back to rule-based analysis if the LLM is unavailable.
- Re-architected a 900-line monolith into a modular, dependency-injected Express API and fixed critical payment bugs. Trades are now recorded only after **server-side Stripe payment verification**, with idempotency.
- Shipped with **Docker Compose**, **GitHub Actions CI** (30 automated tests across Jest and pytest, plus Docker builds) and **auto-deploy to DigitalOcean App Platform**, using encrypted secrets and internal-only microservice networking.
- Led a security cleanup (removed leaked credentials and client-side API keys) and a site-wide UI redesign with a shared design system. JavaScript errors went from **920 to 0**, and layout overflow went from **20 pages to 0** on mobile.

---

## 7. Questions to decide for Phase 2
1. Which Phase 2 features first? The recommended order is: per-user accounts → portfolio engine → dynamic stock pages → AI chat assistant → watchlists and alerts.
2. Migrate the frontend to React + TypeScript now, or keep the static pages and add features first?
3. Keep Stripe test-mode "payments" for buying stocks, or switch to a pure virtual-cash simulator (more realistic for a trading app)?
4. Budget: DigitalOcean is about $10–17/month (covered by the Student Pack credit), and Claude API usage is a few cents per analysis.

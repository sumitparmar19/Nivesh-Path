# Phase 2 Plan (source of truth for Claude Code sessions)

> Original plan written with Claude (claude.ai) in October 2026. Kept verbatim below the
> "Implementation notes" section. Where the notes and the plan disagree, **the notes win**:
> they reflect the real codebase and decisions made while building.

## Implementation notes (read first)

**Status:** Phase 2A ✅ · Phase 2B ✅ (React app) · Phase 2C ✅ (Behavioral Mirror) · next: Phase 2D (pre-trade check + stress test)

### Decisions / deviations from the plan
- **Branch:** sessions push to the branch they are assigned (e.g. `claude/...`), merged via PR, instead of `feat/*` names.
- **Trade model** stays in `models/Stock1.js` (Mongoose model `Purchase`, collection `purchases`); `name` holds the ticker.
  New fields: `userId` (required, indexed), `priceSource` (`live` | `client`).
- **JWT** payload is `{ sub: userId, email }`, signed in `src/routes/auth.js`; middleware in `src/middleware/auth.js`
  (`requireAuth` → 401, `optionalAuth`). Login accepts mobile **or** email; register also returns a token.
- **Virtual cash ledger** lives in `src/lib/ledger.js`: atomic `findOneAndUpdate({cashBalance: {$gte: cost}}, {$inc})`,
  refund if the trade insert fails, a per-user in-process lock so concurrent sells can't oversell
  (replace with a Redis lock when running more than one web instance). Prices come from the server (Finnhub);
  the client price is only a fallback when no live quote is available.
- **Stripe removed** (route, dependency and env var). Paper trading only.
- **Endpoints:** `POST /api/store-purchase` (also `/store-purchase`, `/api/trades`) accepts `{symbol, quantity, price, type: BUY|SELL}`
  and the Phase 1 shape; `GET /api/transactions`, `GET /api/portfolio/holdings`, `GET /api/portfolio/cash-balance`
  (alias `/api/portfolio/summary`), `GET /api/me`, `POST /api/ai/analyze-portfolio` - all require auth.
- **Frontend auth:** `NP.authFetch` in `public/assets/nivesh.js` (adds Bearer token, checks expiry, redirects to
  `/psk/pages/login.html?next=...` on 401). Token stored as `localStorage.token` (+ inside `niveshPathUser`).
- **ChromaDB:** one collection per user (`transactions_user_<id>`), see `collection_name_for()`.

### ChromaDB persistence fix (done, before 2B)
- MongoDB is the source of truth; ChromaDB is a rebuildable cache. The AI service reads `MONGO_URL` too
  (add it to the DigitalOcean **ai** component).
- `ai-service/startup.py` re-embeds every user's `purchases` into their Chroma collection on boot (FastAPI lifespan,
  background thread, idempotent upserts); status shown in the AI service's `/health` as `vector_index`.
  It can also be run by hand: `python startup.py`.
- If a user's collection is missing at analysis time, it is rebuilt for that user on the spot (lazy rebuild).
- `services/mongo_store.py`: `TradeStore` (reads `purchases`; userId as ObjectId or string; skips legacy and
  malformed rows) and `PatternStore` (`behavioral_patterns`: one doc per `(user_id, pattern_type)`, unique index).
  **Phase 2C detectors must write results to `PatternStore`, not to Chroma** (overrides plan steps that say
  "store patterns in ChromaDB").
- Database name: the one in the `MONGO_URL` path (as Mongoose does; `test` if none), or `MONGO_DB_NAME`.
- Tests: `ai-service/tests/test_cold_start.py` (mongomock): clear Chroma -> rebuild -> advisor answers with the
  user's history and no other user's.

### Feature UI (done, before 2B)
- `/portfolio.html` replaces the static `dashboard1.html` mock-up (now a redirect): cash, invested, total value, P&L,
  allocation donut, holdings at live prices with Trade links, recent activity, and an **AI memory** panel
  (`GET /api/ai/memory`, "Re-sync memory" -> `POST /api/ai/memory/rebuild`).
- `/whats-new.html`: release notes with "Try it" links + live status from the public `GET /api/status`.
- Advisor page shows how many trades the AI remembers; login/signup now land on `/portfolio.html`.
- **2B must port these two pages** to React (`/portfolio`, `/whats-new`) along with the 5 core pages.

### Site audit sprints 1-3 (done, before 2B) - decisions from the audit review
- **Sprint 1 cleanup:** deleted Products/Pricing/Support/success/cancel/demo/footer pages and the bolt.new prototype files
  (+ ~150 MB of videos); removed other people's names, photos, testimonials and false claims; one shared layout from
  nivesh.js; 12 stock pages generated from one template, named by ticker (old URLs 301); Markets rebuilt with our own cards
  (no TradingView navigation); landing/About (+5-question FAQ) rewritten; fake social login and Forgot password removed.
- **Sprint 2 data:** profile, settings (theme), password, avatar (initials SVG), reset, delete, watchlist, analyses
  history and contact messages all persist in MongoDB, with Account/Contact/Watchlist/Advisor pages wired to them.
  Language/notifications are stored but not shown in the UI (nothing uses them yet). Email reset + photo upload -> 2F.
- **Sprint 3 data API:** `/api/stocks/*` via `src/lib/marketData.js` (quote 60s, profile 24h, metrics/news/search 1h
  cache). Curated list = 50 (planner's 46 + INTC, CRM, KO, PEP). `/stock.html?symbol=` opens any US ticker already, so 2B's
  `/stock/:symbol` route only needs to replace that page. Run `node scripts/check-finnhub.js` to see if the key's plan
  includes candles; until then the stock page embeds the TradingView chart (inside our page, never as a link).
- **Walmart moved from NYSE to NASDAQ** (Dec 2025): TradingView needs `NASDAQ:WMT`.
- **2B must port:** Markets, stock page, Portfolio, Transactions, Advisor (+history), Watchlist, Account, What's new,
  About, Contact, login/signup - all backends already exist.

### Phase 2B - React app (done)
- **Where:** `frontend/` (Vite 5 + React 18 + TypeScript strict + Tailwind 3, React Router 6, Zustand, TanStack Query,
  Recharts). Built to `frontend/dist` (assets under `/static`, so they never clash with legacy `/assets`) and served by
  the same Express app/Docker image - no second component, no CORS. The Dockerfile builds it in a first stage.
- **All 12 pages ported** (not only the plan's 5): Landing, Login, Register, Portfolio, Transactions, Advisor (+history,
  delete), Stock `/stock/:symbol` (any US ticker), Markets, Watchlist, Account, What's new, About (+FAQ), Contact, 404.
- **Staged rollout:** `src/spa.js` lists each React route with the legacy URLs it replaces; those 301 to it. Setting
  `REACT_DISABLED=/markets,/stock` (env, no code change) rolls a route back to its legacy HTML page. With no build
  (`frontend/dist` missing) the old site is served unchanged. Unknown page URLs get the React 404 screen with status 404;
  `/api/*` is never swallowed. Legacy pages in `public/` stay as the rollback until 2B has run live for a while.
- **Removed routes that clashed with React URLs:** the old JSON `GET /stock/:symbol`, `GET /stock`, `/api/get-api-key`,
  and the `GET /transactions` alias (use `/api/transactions`). Added `DELETE /api/ai/history/:id`.
- **Auth is shared** with the legacy pages: same `localStorage` keys (`token`, `niveshPathUser`, `niveshPathTheme`).
  Theme: light by default, follows the account's saved setting, toggle saves to `PATCH /api/me/settings`.
- **Price chart:** our own Recharts chart when `/api/stocks/:symbol/candles` reports `available: true`, otherwise the
  official TradingView embed inside the page (decided automatically - no need to wait for `check-finnhub.js`).
- **Tests:** Vitest + Testing Library, 75 tests in 14 files (>= 5 per page); Playwright smoke test
  `frontend/e2e/smoke.spec.ts` (sign up -> $100k -> search -> buy -> portfolio -> transactions -> advisor -> logout)
  runs in CI against MongoDB + the real AI service (rule-based, no key) + `FAKE_MARKET_DATA=1`.
- **`FAKE_MARKET_DATA=1`** (`src/lib/fakeMarket.js`): stable made-up prices so CI needs no Finnhub key;
  `server.js` refuses to start with it when `NODE_ENV=production`.
- **Not done (later):** delete the legacy pages in `public/` once React has been live without rollbacks; WebSocket
  prices (2E); measured Lighthouse numbers before quoting any in a resume.

### Phase 2C - Behavioral Mirror (done)
Built from the planner's 2C file as corrected by `docs/PHASE2C_REVIEW.md` (approved) plus three additions.
- **Rules** (`src/lib/behaviorRules.js`, pure functions, reused by 2D before a trade):
  - panic sell = SELL after a 5-day return of -5% or worse (low 5%, medium 10%, high 20%); records loss vs average cost;
  - FOMO buy = BUY within 5% of the 52-week high (low; medium within 3%; high within 2% AND 5-day run-up >= 15%);
  - overconcentration = one stock > 35% / 50% / 65% of **cash + holdings** (option A: no warning on a small first buy).
- **Data:** `marketData.momentum()` reads Finnhub basic financials (`52WeekHigh`, `5DayPriceReturnDaily`), cached 1h and
  shared with key stats. No candles (not on the free plan).
- **Storage:** Node writes one `BehaviorEvent` per detection to `behavioral_events`. `behavioral_patterns` stays the AI
  service's `PatternStore` (unique `(user_id, pattern_type)`): it keeps the coach insight (`coach_insight`) and per-type
  counts. Reset and account deletion remove both.
- **Dedup:** a new overconcentration event only if none is active for that stock or the severity went up; when the stock
  falls back to 35% or less (or is sold) its active events get `clearedAt`, so a later re-crossing warns again.
- **Trade flow:** the trade route waits for detection at most 1.5s (`detectWithin`). If ready, the response has
  `behavior: [...]` and the trade panel shows a note; if not, `behavior: null` and detection finishes in the background.
  Detection can never fail a trade (every step is caught and logged; `bufferCommands: false` so a DB outage fails fast).
- **Scores** (computed in Node, never by the LLM): impulse control = trades without a panic/FOMO flag / all trades (shown
  only from 3 trades); diversification = 100 - largest stock's share of the account.
- **AI coach:** FastAPI `POST /api/ai/behavior/{user_id}` (structured output `BehaviorCoaching`: headline, insight,
  suggestion; facts pre-computed; rule-based fallback; not called when there are no events); `GET` returns the last one.
- **UI:** `/behavioral-mirror` (scores, AI coach, filterable pattern cards with Got it / Dismiss / Mark all read, how it
  works), sidebar item with unread count, trade-panel note, "Trading DNA" strip on Portfolio, What's new entry.
- **Fake mode:** two NEW tickers only (`FOMO` triggers a high FOMO buy, `DROP` a medium panic sell); existing fake prices
  unchanged. Playwright covers trade -> note -> page -> coach -> mark read.
- **Limits:** no backfill of panic/FOMO for trades made before 2C (the market situation at that moment wasn't stored).
- **Tests:** 178 -> 238 (Jest 111, pytest 31, Vitest 94, Playwright 2). Two existing Vitest assertions were updated
  because the feature changed what they checked (2C left the roadmap; the theme test now finds its PATCH by method).

### Known risks to handle in later phases
1. **Cold start** for the Behavioral Mirror (still open after 2C): new users have no history -> add a demo account with realistic
   seeded trades and **CSV import** of real broker history (Robinhood / Webull / Zerodha) in Phase 2C.
2. **Historical data:** panic-sell/FOMO detection needs historical prices + news per trade; Finnhub free tier limits
   candles - confirm a free source before building 2C.
3. ~~**ChromaDB on DigitalOcean is ephemeral**~~ - fixed: rebuilt from MongoDB on cold start (see above). Atlas Vector
   Search remains an option if the index grows too big to rebuild at boot.
4. **Embeddings:** current ones are local hashing (lexical). Semantic search needs an embedding model (e.g. Voyage AI)
   - a local model is heavy for the 1 GB instance.
5. **Model:** the plan says `claude-sonnet-4-6`; the app uses `CLAUDE_MODEL` (currently `claude-opus-5-5`).
   Use a cheaper current model (e.g. `claude-sonnet-5-5`) for high-volume chat; keep it configurable.
6. **Cost:** a BullMQ worker is an extra component; DO managed Redis is ~$15/mo - prefer Upstash free Redis.
7. Market claims in the plan (62% stat, Robinhood May 2026 launch, Webull) are unverified - cite sources before
   putting them in README/resume. Every coaching message keeps the "educational, not financial advice" disclaimer.

---

# Nivesh-Path v2 — Complete Phase 2 Instructions for Claude Code
# Generated: October 2026 | Owner: Sumit Parmar | MS CS @ UB, Dec 2026

---

## MASTER CONTEXT — READ THIS FIRST, EVERY SESSION

### What This Project Is
Nivesh-Path is an **AI-Powered Behavioral Finance Platform** — the only investing
platform that studies YOUR specific trading patterns, identifies YOUR behavioral biases
(panic selling, FOMO buying, overconcentration), and coaches you with evidence from
YOUR own trade history.

**Core Insight (say this in every AI feature):**
Retail investors lose money not from lack of information — from behavioral biases.
Existing platforms (Robinhood, Webull) amplify these biases. Nivesh-Path fixes them.

### Owner
- Sumit Parmar
- MS CS @ University at Buffalo | Graduating December 2026
- Targeting: SWE, Full Stack, Backend, Data Engineer roles
- This project must demonstrate: React/TS, Python/FastAPI, asyncio, LangChain,
  Claude API, ChromaDB RAG, Node.js, MongoDB, Redis, Docker, GitHub Actions,
  WebSocket, BullMQ, AWS S3, System Design, Testing

### Live URLs
- App: https://nivesh-path-vzeak.ondigitalocean.app (update after custom domain)
- GitHub: https://github.com/sumitparmar19/Nivesh-Path (branch: main)

### Phase 1 Status (COMPLETE — DO NOT CHANGE)
- ✅ Node.js/Express modular API (src/ folder structure)
- ✅ Python/FastAPI AI service (ai-service/ folder)
- ✅ Claude API + LangChain + ChromaDB RAG (basic portfolio analysis)
- ✅ JWT auth (login/register work, tokens issued)
- ✅ Stripe payments (buy flow — will be REPLACED with virtual cash in Phase 2A)
- ✅ Docker Compose (web + ai + mongo + redis)
- ✅ GitHub Actions CI (Jest + pytest, green)
- ✅ DigitalOcean deployment (auto-deploy on main)
- ✅ 30 automated tests passing
- ✅ 29 pages redesigned, 0 JS errors, 0 mobile overflow

### KNOWN CRITICAL BUG (fix in Phase 2A immediately):
Transactions are NOT per-user. All users share one portfolio. This must be
fixed BEFORE sharing the live link with anyone.

---

## ARCHITECTURE (current + target)

```
Browser (React 18 + TypeScript + Tailwind) ← Phase 2B migration
  │  REST/fetch → Auth, Trades, Portfolio
  │  WebSocket  → Real-time prices + News alerts + AI stream ← Phase 2E
  ▼
API Gateway: Express + Helmet + rate-limit + JWT auth (Port 3000)
  ├─ Auth Service    → JWT/bcryptjs (EXISTING)
  ├─ Trade Service   → virtual cash ledger + holdings ← Phase 2A
  ├─ Market Service  → Finnhub REST + WebSocket ← Phase 2E
  ├─ News Pipeline   → BullMQ + Redis pub/sub ← Phase 2E
  └─ AI Proxy        → enriches + calls AI service (EXISTING)
  ▼
AI Behavioral Service: FastAPI (Port 8001, internal only)
  ├─ Behavioral Analytics Engine (pandas + numpy) ← Phase 2C
  ├─ Pre-Trade Bias Checker ← Phase 2D
  ├─ Portfolio Stress Tester (numpy) ← Phase 2D
  ├─ LangChain Agent + 5 Tools (streaming) ← Phase 2E
  ├─ Claude API claude-sonnet-4-6 (streaming SSE) ← Phase 2E
  └─ ChromaDB (per-user namespaces) ← Phase 2A fix
Data Layer:
  MongoDB Atlas → users (+ cashBalance), transactions (+ userId), snapshots
  Redis         → price cache + pub/sub + BullMQ queues
  ChromaDB      → per-user trade embeddings + behavioral metadata
Background Jobs: BullMQ ← Phase 2E
  ├─ newsIngestionQueue (every 5 min)
  ├─ portfolioSnapshotQueue (daily midnight UTC)
  ├─ behavioralRecomputeQueue (after each trade)
  └─ priceAlertQueue (every 60s)
Cloud: AWS S3 (trade history backups) ← Phase 2F
Observability: New Relic APM + Sentry DSN ← Phase 2F
```

---

## CODING RULES (apply to ALL phases)

1. TypeScript everywhere on frontend — no `any` types
2. Python with type hints on all functions — no untyped signatures
3. FastAPI endpoints must have docstrings and response_model
4. All new code has error handling (try/catch in JS, try/except in Python)
5. No hardcoded values — use environment variables
6. Every new file gets a 2-line comment at top: what it does + why it exists
7. Commits: small and descriptive ("feat: add userId filter to transactions query")
8. Never break the CI — run tests before committing
9. Environment variables go in .env.example (never in .env committed to git)
10. Each feature gets its own git branch, merged via PR

---

## PHASE 2A — PER-USER ACCOUNTS + VIRTUAL CASH LEDGER
### Priority: CRITICAL — Do this first, before anything else
### Branch: feat/per-user-accounts
### Estimated: 1-2 days

**THE PROBLEM TO SOLVE:**
Right now all trades are stored globally. User A and User B share the same
portfolio. This makes the live demo look broken. Also, the Stripe buy flow
requires a real credit card to demo. Replace it with virtual $100k cash.

### Step 1: Update Transaction Model (MongoDB)
File: src/models/Transaction.js

Add `userId` field to schema:
```javascript
userId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'User',
  required: true,
  index: true  // IMPORTANT: index for query performance
}
```

### Step 2: Update User Model (MongoDB)
File: src/models/User.js

Add cash ledger fields:
```javascript
cashBalance: {
  type: Number,
  default: 100000,  // $100,000 virtual starting cash
  min: 0
},
totalDeposited: {
  type: Number,
  default: 100000   // track for lifetime P&L
}
```

### Step 3: Create Auth Middleware
File: src/middleware/auth.js (CREATE THIS FILE)

```javascript
/**
 * JWT authentication middleware
 * Attaches req.user = { id, email } if valid token
 * Returns 401 if token missing or invalid
 */
const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = header.slice(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.userId || decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
```

### Step 4: Protect These Routes (apply requireAuth middleware)
File: src/routes/trades.js, src/routes/portfolio.js, src/routes/ai.js

Apply `requireAuth` to:
- POST /api/store-purchase (or /store-purchase)
- GET /api/transactions (or /transactions)
- GET /api/portfolio/holdings
- POST /api/ai/analyze-portfolio
- All future trade/portfolio/AI endpoints

### Step 5: Replace Stripe Buy Flow with Virtual Cash
File: src/routes/trades.js

REMOVE: Stripe Checkout session creation for buy orders
REPLACE WITH: Virtual cash deduction

New buy flow:
```
1. Validate: quantity > 0, symbol exists
2. Get live price from Finnhub (or use price from request body)
3. Calculate total cost = quantity * price
4. Check user.cashBalance >= totalCost → if not, return 400 "Insufficient funds"
5. Deduct: user.cashBalance -= totalCost (atomic $inc in MongoDB)
6. Create Transaction: { userId: req.user.id, type: 'BUY', symbol, quantity, price, totalCost, timestamp }
7. Embed trade in ChromaDB under user's namespace (call ai-service)
8. Return: { success: true, newBalance: user.cashBalance, transaction }
```

New sell flow:
```
1. Validate: quantity > 0
2. Check holdings: user must own >= quantity of symbol
3. Get current price
4. Credit: user.cashBalance += quantity * currentPrice
5. Create Transaction: { userId: req.user.id, type: 'SELL', ... }
6. Return: { success: true, newBalance: user.cashBalance, transaction }
```

New API endpoint: GET /api/portfolio/cash-balance
Returns: { cashBalance, totalDeposited, totalValue (cash + holdings value) }

### Step 6: Filter ALL Queries by userId
Every query that reads transactions MUST filter by req.user.id:

```javascript
// WRONG (current):
const transactions = await Transaction.find({});

// RIGHT:
const transactions = await Transaction.find({ userId: req.user.id });
```

Apply to: GET /transactions, GET /api/portfolio/holdings, all aggregate queries.

### Step 7: Fix ChromaDB — Per-User Namespaces
File: ai-service/services/vector_service.py

Change ChromaDB collection naming from shared to per-user:
```python
# WRONG (current):
collection = chroma_client.get_or_create_collection("trades")

# RIGHT:
def get_user_collection(user_id: str):
    """Each user gets their own ChromaDB collection for data isolation"""
    collection_name = f"trades_user_{user_id}"
    return chroma_client.get_or_create_collection(collection_name)
```

All ChromaDB reads/writes must use the user's collection.

### Step 8: Update Frontend JWT Headers
Every fetch call that hits a protected route must include:
```javascript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${localStorage.getItem('token')}`
}
```

Create a helper: public/js/api.js (shared across pages)
```javascript
/**
 * Authenticated fetch wrapper
 * Automatically adds JWT header, handles 401 redirects
 */
async function authFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  if (!token) { window.location.href = '/login.html'; return; }
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  if (response.status === 401) { window.location.href = '/login.html'; return; }
  return response;
}
```

### Phase 2A Tests (add these — minimum 6 new tests)
File: tests/auth.test.js (add to existing)

```
1. POST /api/store-purchase without token → 401
2. GET /api/transactions without token → 401
3. GET /api/portfolio/holdings without token → 401
4. User A's transactions NOT visible to User B (create 2 users, verify isolation)
5. Buy with sufficient cash → cashBalance decreases correctly
6. Buy with insufficient cash → 400 "Insufficient funds"
7. Sell shares you don't own → 400 with clear message
8. Cash balance updates atomically (no race condition)
```

### Phase 2A Success Criteria:
- [ ] Two test users have completely isolated portfolios
- [ ] Virtual cash balance shown on dashboard
- [ ] Buy deducts cash, sell adds cash
- [ ] No Stripe card required to test the app
- [ ] All existing 30 tests still pass
- [ ] 6+ new tests added and passing
- [ ] CI remains green

---

## PHASE 2B — REACT + TYPESCRIPT MIGRATION
### Branch: feat/react-migration
### Estimated: 3-4 days
### Start AFTER Phase 2A is merged

**THE GOAL:**
Migrate 5 core pages from static HTML to React 18 + TypeScript + Tailwind.
These are the pages that matter for the demo flow and interviews.
Keep the existing Express API — only the frontend changes.

### Setup (use existing psk/src if it's a valid Vite/React project, else create fresh)
```bash
cd frontend  # or create new folder
npm create vite@latest . -- --template react-ts
npm install tailwindcss @tailwindcss/vite zustand react-router-dom
npm install recharts @types/recharts
npm install lucide-react  # icons
```

Tailwind config: use CSS variables to match existing Nivesh brand colors from nivesh.css
(brand green: #16A34A, background: #0F172A dark / #FFFFFF light)

### TypeScript Types (create src/types/index.ts)
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  cashBalance: number;
  totalDeposited: number;
}

export interface Trade {
  _id: string;
  userId: string;
  type: 'BUY' | 'SELL';
  symbol: string;
  companyName: string;
  quantity: number;
  price: number;
  totalCost: number;
  timestamp: string;
}

export interface Holding {
  symbol: string;
  companyName: string;
  quantity: number;
  avgCost: number;
  currentPrice: number;
  currentValue: number;
  totalCost: number;
  pnl: number;
  pnlPercent: number;
  weight: number;  // % of portfolio
}

export interface Portfolio {
  holdings: Holding[];
  cashBalance: number;
  totalValue: number;
  totalCost: number;
  totalPnl: number;
  totalPnlPercent: number;
}

export interface AIInsight {
  summary: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  diversificationScore: number;
  strengths: string[];
  risks: string[];
  recommendations: string[];
  behavioralWarnings?: BehavioralWarning[];
}

export interface BehavioralWarning {
  type: string;
  message: string;
  evidence: string;
  severity: 'INFO' | 'WARN' | 'ALERT';
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolsUsed?: string[];
}
```

### Zustand Store (src/store/useStore.ts)
```typescript
/**
 * Global state management for Nivesh-Path
 * Uses Zustand for lightweight, hook-based state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User, Portfolio, Trade } from '../types';

interface AppStore {
  // Auth
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  // Portfolio
  portfolio: Portfolio | null;
  setPortfolio: (p: Portfolio) => void;
  // Trades
  recentTrades: Trade[];
  setRecentTrades: (t: Trade[]) => void;
  // WebSocket
  livePrice: Record<string, number>;
  updatePrice: (symbol: string, price: number) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null, token: null,
      setAuth: (user, token) => set({ user, token }),
      logout: () => { localStorage.removeItem('token'); set({ user: null, token: null }); },
      portfolio: null, setPortfolio: (portfolio) => set({ portfolio }),
      recentTrades: [], setRecentTrades: (recentTrades) => set({ recentTrades }),
      livePrice: {}, updatePrice: (symbol, price) =>
        set(state => ({ livePrice: { ...state.livePrice, [symbol]: price } }))
    }),
    { name: 'nivesh-store', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
);
```

### API Client (src/lib/api.ts)
```typescript
/**
 * Typed API client for all backend calls
 * Handles auth headers, error handling, and response typing
 */
const BASE_URL = import.meta.env.VITE_API_URL || '';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('nivesh-store')
    ? JSON.parse(localStorage.getItem('nivesh-store')!).state.token : null;
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  if (res.status === 401) { window.location.href = '/login'; }
  if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Request failed'); }
  return res.json();
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: User }>('/api/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      }),
    register: (name: string, email: string, password: string, mobile: string) =>
      request<{ token: string; user: User }>('/api/register', {
        method: 'POST', body: JSON.stringify({ name, email, password, mobile })
      })
  },
  portfolio: {
    getHoldings: () => request<Portfolio>('/api/portfolio/holdings'),
    getCashBalance: () => request<{ cashBalance: number; totalValue: number }>('/api/portfolio/cash-balance'),
    getTransactions: () => request<Trade[]>('/api/transactions')
  },
  trades: {
    buy: (symbol: string, quantity: number, price: number) =>
      request<{ success: boolean; newBalance: number }>('/api/store-purchase', {
        method: 'POST', body: JSON.stringify({ symbol, quantity, price, type: 'BUY' })
      }),
    sell: (symbol: string, quantity: number, price: number) =>
      request<{ success: boolean; newBalance: number }>('/api/store-purchase', {
        method: 'POST', body: JSON.stringify({ symbol, quantity, price, type: 'SELL' })
      })
  },
  market: {
    getQuote: (symbol: string) => request<{ price: number; change: number }>(`/stock/${symbol}`),
    search: (q: string) => request<{ results: any[] }>(`/search?q=${q}`)
  },
  ai: {
    analyzePortfolio: (holdings: Holding[], question?: string) =>
      request<AIInsight>('/api/ai/analyze-portfolio', {
        method: 'POST', body: JSON.stringify({ holdings, question })
      }),
    getBehavioralAnalysis: () =>
      request<BehavioralAnalysis>('/api/ai/behavioral-analysis')
  }
};
```

### Pages to Build (in this order)

**Page 1: Login + Register (src/pages/Auth.tsx)**
- Single page with tab toggle Login | Register
- Form validation with error states
- On success: store token in Zustand + redirect to /dashboard
- Tailwind styled, matches Nivesh green brand

**Page 2: Dashboard (src/pages/Dashboard.tsx)**
- Shows: totalPortfolioValue, cashBalance, totalPnl (green/red), totalPnlPercent
- Holdings summary cards (top 3 by value)
- Quick trade widget (symbol search + buy/sell)
- Recent trades list (last 5)
- Navigation to AI Advisor

**Page 3: Portfolio (src/pages/Portfolio.tsx)**
- Full holdings table: Symbol, Shares, Avg Cost, Current Price, Value, P&L, Weight %
- Portfolio allocation chart (Recharts PieChart)
- P&L chart over time (Recharts LineChart — needs snapshot data from Phase 2C)
- Cash balance display
- Total value = cash + holdings value

**Page 4: AI Advisor (src/pages/AIAdvisor.tsx)**
- Holdings input (pre-populated from portfolio)
- Risk profile selector (Conservative/Moderate/Aggressive)
- Optional question text input
- "Analyze Portfolio" button → calls /api/ai/analyze-portfolio
- Results: risk level badge, diversification score, strengths list,
  risks list, recommendations list
- Behavioral warnings section (Phase 2C adds data here)

**Page 5: Stock Detail (src/pages/StockDetail.tsx) — dynamic route**
- Route: /stock/:symbol
- Loads from Finnhub API: price, change, company info
- TradingView widget embed
- Buy/Sell panel
- Replaces the 12 hardcoded HTML stock pages

### React Router Setup (src/App.tsx)
```typescript
Routes:
/ → redirect to /dashboard if logged in, else /login
/login → Auth page
/dashboard → Dashboard (protected)
/portfolio → Portfolio (protected)
/advisor → AIAdvisor (protected)
/trades → Transactions list (protected)
/stock/:symbol → StockDetail (protected)
```

Protected route wrapper: if no token in store, redirect to /login.

### Build Config
- Vite builds to dist/
- Express serves dist/ as static files (update server.js to serve from dist/)
- API calls use relative URLs (no CORS issues)
- Environment: VITE_API_URL="" for same-origin deployment

### Phase 2B Tests
- Add Playwright tests for React pages
- Test: login flow, dashboard loads holdings, buy flow, sell flow
- All existing backend tests still pass

---

## PHASE 2C — BEHAVIORAL MIRROR (AI Feature 01)
### Branch: feat/behavioral-mirror
### Estimated: 2-3 days
### Start AFTER Phase 2B is merged

**THE CORE FEATURE — This is what makes Nivesh-Path unique.**
Analyze a user's full trade history to identify their behavioral biases.
Tell them: "You panic-sold 4 times. Your best trades were held 30+ days.
Your FOMO pattern costs you 8% annually."

### New FastAPI Endpoints (ai-service/routers/behavioral.py)

**GET /api/ai/behavioral-analysis**
Request: JWT auth (userId from token via header)
Process:
1. Load all user's trades from MongoDB (via HTTP call to Express or shared DB)
2. Run behavioral pattern detection (see below)
3. Store patterns in ChromaDB user collection
4. Call Claude API to generate narrative insight from patterns
5. Return structured BehavioralAnalysis

Response schema (Pydantic):
```python
class BehavioralPattern(BaseModel):
    pattern_type: str  # "panic_sell", "fomo_buy", "overconcentration", "short_holding"
    frequency: int
    impact_estimate_pct: float  # estimated annual return impact
    evidence: list[str]  # specific examples from their trades
    severity: Literal["LOW", "MEDIUM", "HIGH"]

class BehavioralAnalysis(BaseModel):
    patterns: list[BehavioralPattern]
    overall_score: int  # 0-100, higher = better behavioral discipline
    best_trade_conditions: str  # "You perform best when holding > 30 days"
    worst_trade_conditions: str  # "You lose most on same-day news reactions"
    narrative: str  # Claude-generated 2-3 sentence plain English summary
    total_trades_analyzed: int
    period_analyzed_days: int
```

### Behavioral Pattern Detection Engine
File: ai-service/services/behavioral_engine.py

```python
"""
Behavioral pattern detection for trading history.
Uses pandas for computation. LLM never does the math — only the narrative.
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def detect_panic_sells(trades_df: pd.DataFrame) -> BehavioralPattern | None:
    """
    Panic sell = SELL within 72 hours of a BUY, at a loss.
    Finds: frequency, average loss, triggering conditions.
    """

def detect_fomo_buys(trades_df: pd.DataFrame, price_data: dict) -> BehavioralPattern | None:
    """
    FOMO buy = BUY within 24 hours of a price spike > 5%.
    Usually results in buying at peak, losing on pullback.
    """

def detect_overconcentration(trades_df: pd.DataFrame) -> BehavioralPattern | None:
    """
    Overconcentration = single stock > 40% of portfolio by value.
    HHI (Herfindahl-Hirschman Index) > 0.25 = concentrated.
    """

def analyze_holding_periods(trades_df: pd.DataFrame) -> dict:
    """
    Computes: avg holding period per symbol, correlation with P&L.
    Returns: best_holding_days (highest avg P&L), worst_holding_days.
    """

def compute_behavioral_score(patterns: list[BehavioralPattern]) -> int:
    """
    0-100 score. 100 = perfect discipline, 0 = all bad patterns.
    Deduct points for each pattern weighted by severity and frequency.
    """

def run_full_behavioral_analysis(user_id: str, trades: list[dict]) -> BehavioralAnalysis:
    """
    Main entry point. Runs all detectors, computes score, generates Claude narrative.
    trades: list of trade dicts from MongoDB
    """
    df = pd.DataFrame(trades)
    patterns = []
    patterns.append(detect_panic_sells(df))
    patterns.append(detect_fomo_buys(df, {}))
    patterns.append(detect_overconcentration(df))
    # filter None results
    patterns = [p for p in patterns if p is not None]
    holding_analysis = analyze_holding_periods(df)
    score = compute_behavioral_score(patterns)
    narrative = generate_claude_narrative(patterns, score, holding_analysis)
    return BehavioralAnalysis(patterns=patterns, overall_score=score, ...)
```

### Trade Embedding with Behavioral Metadata
File: ai-service/services/vector_service.py

When a trade is embedded in ChromaDB, include metadata:
```python
metadata = {
    "user_id": user_id,
    "type": trade["type"],        # BUY or SELL
    "symbol": trade["symbol"],
    "price": trade["price"],
    "quantity": trade["quantity"],
    "total_cost": trade["totalCost"],
    "timestamp": trade["timestamp"],
    "day_of_week": datetime.fromisoformat(trade["timestamp"]).weekday(),
    "hour_of_day": datetime.fromisoformat(trade["timestamp"]).hour,
    "market_session": "pre" if hour < 9 else "regular" if hour < 16 else "after"
}
```
This metadata enables: "Your worst trades happen on Fridays after 2pm" type insights.

### React Behavioral Dashboard (src/components/BehavioralMirror.tsx)
- Fetch GET /api/ai/behavioral-analysis on mount
- Show: Behavioral Score (0-100) as circular progress bar
- Pattern cards: each pattern as a card with severity badge, evidence list, impact estimate
- Best/worst trade conditions as highlighted callouts
- Claude narrative as main headline text
- "What this means" expandable section per pattern

### Phase 2C Tests (8 new pytest tests)
```
1. detect_panic_sells: mock trades with known panic sell → correct detection
2. detect_panic_sells: no qualifying trades → returns None
3. detect_fomo_buys: mock trades with price spike data → correct detection
4. detect_overconcentration: portfolio > 40% in one stock → detected
5. compute_behavioral_score: all bad patterns → score < 30
6. compute_behavioral_score: no bad patterns → score > 80
7. GET /api/ai/behavioral-analysis with no trades → returns empty analysis
8. GET /api/ai/behavioral-analysis with mock trades → returns structured response
```

---

## PHASE 2D — PRE-TRADE CHECK + PORTFOLIO STRESS TEST
### Branch: feat/pretrade-stress
### Estimated: 2 days
### Start AFTER Phase 2C is merged

### Feature 1: Pre-Trade Bias Check

**New FastAPI endpoint: POST /api/ai/pre-trade-check**
Request:
```json
{
  "user_id": "...",
  "action": "BUY" | "SELL",
  "symbol": "TSLA",
  "quantity": 5,
  "price": 218.50,
  "current_holdings": [...]
}
```
Process:
1. Load user's behavioral patterns from ChromaDB
2. Check if this trade matches any known bad pattern:
   - BUY after recent price spike > 5% → FOMO warning
   - SELL at a loss within 72h of buy → panic sell warning
   - BUY would make one stock > 40% of portfolio → overconcentration warning
3. Retrieve similar past trades from ChromaDB (semantic search)
4. Call Claude with: pattern match + similar past trades + current context
5. Return: warning (if any) + evidence + recommendation

Response:
```python
class PreTradeCheck(BaseModel):
    should_warn: bool
    warning_type: str | None  # "PANIC_SELL", "FOMO_BUY", "OVERCONCENTRATION"
    warning_message: str | None
    evidence: list[str]  # "Last time you did this: X happened"
    recommendation: str
    similar_past_trades: list[dict]  # RAG retrieved
    proceed_anyway_label: str  # "I understand the risk, proceed"
```

**React Pre-Trade Modal (src/components/PreTradeModal.tsx)**
Before trade confirmation:
1. Call POST /api/ai/pre-trade-check
2. If should_warn = false: proceed directly to trade confirmation
3. If should_warn = true: show modal with:
   - Warning type badge (PANIC SELL / FOMO / OVERCONCENTRATION)
   - Warning message
   - Evidence list (specific past trades)
   - Recommendation
   - Two buttons: "Cancel" and "I understand the risk, proceed"
4. Only execute trade if user clicks proceed

This is the KEY UX feature — it pauses users before bad decisions.

### Feature 2: Portfolio Stress Test

**New FastAPI endpoint: POST /api/ai/stress-test**
Request:
```json
{
  "holdings": [...],
  "scenario": "TECH_DROP_20" | "MARKET_CRASH_30" | "SECTOR_ROTATION" | "CUSTOM",
  "custom_pct_drop": -15,  // only if scenario = "CUSTOM"
  "custom_symbols": ["NVDA", "MSFT"]  // only if scenario = "CUSTOM"
}
```

Process (numpy — LLM does NOT do the math):
```python
import numpy as np

def run_stress_test(holdings: list[Holding], scenario: StressScenario) -> StressTestResult:
    """
    Computes dollar impact of a stress scenario on each holding.
    Uses sector correlation data to estimate co-movement.
    """
    # 1. Apply scenario drop percentage to relevant holdings
    # 2. Compute per-holding impact (quantity * price * drop_pct)
    # 3. Compute total portfolio impact
    # 4. Compute new portfolio weights after stress
    # 5. Identify most vulnerable positions
    # 6. Call Claude to generate plain English interpretation
    
SCENARIOS = {
    "TECH_DROP_20": { "sectors": ["technology"], "drop_pct": -0.20 },
    "MARKET_CRASH_30": { "sectors": ["all"], "drop_pct": -0.30 },
    "SECTOR_ROTATION": { "sectors": ["technology"], "drop_pct": -0.15,
                         "gains": { "energy": 0.10, "healthcare": 0.08 } },
}
```

Response:
```python
class HoldingImpact(BaseModel):
    symbol: str
    current_value: float
    stressed_value: float
    dollar_impact: float
    pct_impact: float

class StressTestResult(BaseModel):
    scenario_name: str
    total_current_value: float
    total_stressed_value: float
    total_dollar_impact: float
    total_pct_impact: float
    holding_impacts: list[HoldingImpact]
    most_vulnerable: list[str]  # top 3 symbols by dollar loss
    narrative: str  # Claude plain English explanation
    hedge_suggestions: list[str]  # Claude suggestions
```

**React Stress Test UI (src/components/StressTest.tsx)**
- Scenario selector buttons: Tech Drop 20%, Market Crash 30%, Custom
- Custom: slider for drop % + symbol multi-select
- Run button → calls /api/ai/stress-test
- Results table: each holding, current value, stressed value, impact
- Total impact summary (big number, red)
- Claude narrative below
- "Hedge Suggestions" collapsible section

### Phase 2D Tests
```
1. Pre-trade check: SELL at loss within 48h of buy → panic sell warning triggered
2. Pre-trade check: BUY after 7% spike → FOMO warning triggered
3. Pre-trade check: BUY making single stock 45% of portfolio → overconcentration warning
4. Pre-trade check: Normal trade → should_warn = false
5. Stress test TECH_DROP_20: tech holdings show -20% impact
6. Stress test MARKET_CRASH_30: all holdings impacted
7. Stress test: empty holdings → returns zero impact
8. Stress test: dollar math is correct (not estimated)
```

---

## PHASE 2E — REAL-TIME NEWS PIPELINE + AI CHAT ASSISTANT
### Branch: feat/realtime-news-chat
### Estimated: 4-5 days (biggest phase)
### Start AFTER Phase 2D is merged

### Part 1: Background Job Queue (BullMQ)

Install: `npm install bullmq ioredis`

File: src/queues/index.js
```javascript
/**
 * BullMQ queue definitions for all background jobs.
 * Redis is the broker. Jobs are processed by worker.js.
 */
const { Queue } = require('bullmq');
const redisConnection = { host: process.env.REDIS_HOST || 'redis', port: 6379 };

const newsQueue = new Queue('news-ingestion', { connection: redisConnection });
const snapshotQueue = new Queue('portfolio-snapshot', { connection: redisConnection });
const behavioralQueue = new Queue('behavioral-recompute', { connection: redisConnection });
const alertQueue = new Queue('price-alerts', { connection: redisConnection });
```

File: src/workers/worker.js (runs as separate process in Docker)
```javascript
Jobs to implement:
1. news-ingestion (runs every 5 minutes):
   - Fetch latest news from Finnhub news API for all symbols held by any active user
   - For each news item: call Claude for 2-sentence sentiment summary
   - Find which users hold the affected symbol
   - Publish to Redis channel: news:userId → news payload
   - Store in MongoDB: NewsEvent collection

2. portfolio-snapshot (runs daily at midnight UTC):
   - For each user: compute total portfolio value (holdings * prices + cash)
   - Store as PortfolioSnapshot { userId, date, totalValue, holdings, cashBalance }
   - Used for performance charts in Portfolio page

3. behavioral-recompute (triggered after each trade):
   - Re-run behavioral analysis for the user who just traded
   - Update their ChromaDB patterns
   - Light version (not full analysis, just update deltas)

4. price-alerts (runs every 60s — Phase 2F feature):
   - Check user-defined price alerts
   - Notify via WebSocket if triggered
```

### Part 2: WebSocket Server for Real-time Push

File: src/lib/websocket.js
```javascript
/**
 * WebSocket server for real-time updates.
 * Clients receive: live prices, news alerts, AI stream chunks.
 * Redis pub/sub bridges background jobs to WebSocket connections.
 */
const { WebSocketServer } = require('ws');
const { createClient } = require('redis');

// Subscriber listens for Redis pub/sub messages
// Routes to correct WebSocket client by userId
// Message types:
//   { type: 'PRICE_UPDATE', symbol, price, change }
//   { type: 'NEWS_ALERT', symbol, headline, sentiment, portfolioImpact }
//   { type: 'AI_CHUNK', conversationId, chunk, done }
```

### Part 3: Finnhub WebSocket → Server → Client

File: src/services/marketFeed.js
```javascript
/**
 * Connects to Finnhub WebSocket for live price streaming.
 * Subscribes to symbols that any connected user holds.
 * Publishes prices to Redis → relayed to users via WebSocket.
 * Fallback: if Finnhub WS fails, use HTTP polling (existing behavior).
 */
```

### Part 4: News → Portfolio Impact Radar

File: src/services/newsImpact.js
```javascript
/**
 * For each news item, finds which users hold the affected symbol.
 * Computes: position size, dollar impact, portfolio %.
 * Formats as a notification payload.
 * Published to Redis → WebSocket → user's browser in real-time.
 */
async function computeNewsImpact(newsItem, userId) {
  // Load user's holdings
  // Find if they hold the symbol in the news
  // Compute: quantity * price, portfolio weight
  // Return impact payload for notification
}
```

### Part 5: AI Chat Assistant with Tools (THE SHOWPIECE FEATURE)

File: ai-service/routers/chat.py

**New FastAPI endpoint: POST /api/ai/chat** (streaming SSE)

LangChain Tools to implement (5 tools):
```python
@tool
def get_current_quote(symbol: str) -> dict:
    """Get the current stock price and daily change for a symbol."""
    # Calls Finnhub REST API

@tool
def get_my_holdings(user_id: str) -> list[dict]:
    """Get the user's current portfolio holdings with live values."""
    # Queries MongoDB for user's holdings

@tool
def get_my_trade_history(user_id: str, symbol: str = None, limit: int = 20) -> list[dict]:
    """Get the user's trade history, optionally filtered by symbol."""
    # Queries MongoDB transactions

@tool
def run_portfolio_stress_test(user_id: str, scenario: str, custom_pct: float = None) -> dict:
    """Run a stress test scenario on the user's current portfolio."""
    # Calls the stress test service

@tool
def get_news_for_symbol(symbol: str) -> list[dict]:
    """Get recent news and AI sentiment for a symbol."""
    # Queries MongoDB NewsEvent collection
```

Streaming endpoint:
```python
@router.post("/chat")
async def chat_stream(request: ChatRequest):
    """
    Streaming AI chat assistant.
    Uses LangChain agent with 5 tools.
    Streams response tokens via SSE.
    User's message + chat history + tool results → Claude claude-sonnet-4-6.
    """
    async def generate():
        # Build prompt with: user context, chat history, available tools
        # Stream Claude response via Anthropic streaming API
        # Yield each chunk as SSE event: data: {"chunk": "...", "done": false}
        # When done: yield data: {"done": true, "tools_used": [...]}
    
    return StreamingResponse(generate(), media_type="text/event-stream")
```

System prompt for chat (include in every request):
```
You are Nivesh-Path's AI financial assistant. You have access to real tools
that can look up the user's actual portfolio, trade history, and live prices.
ALWAYS use tools to ground your responses in real data. Never make up numbers.
When analyzing trades, reference specific examples from their history.
Be educational: explain WHY something is happening, not just what.
Remind users you're not a licensed financial advisor for legal compliance.
```

### Part 6: React Streaming Chat UI (src/components/AIChat.tsx)
```typescript
/**
 * Streaming AI chat interface.
 * Messages stream token by token (no waiting for full response).
 * Shows which tools were used: "Used: get_my_holdings, get_current_quote"
 * Chat history persisted in Zustand (cleared on logout).
 */
```
UI elements:
- Chat history (scrollable, bottom-anchored)
- Message bubbles (user right, AI left with Nivesh green accent)
- Streaming: text appears word by word as tokens arrive
- Tool usage indicator: small chips below each AI message
- Suggested questions: "What's my biggest risk?", "Should I rebalance?",
  "What happens if tech drops 20%?", "Analyze my worst trade"
- Input: text area + Send button + Ctrl+Enter shortcut

### Phase 2E Tests (10 new tests)
```
Backend:
1. newsQueue: job added on schedule (mock timer)
2. snapshotQueue: portfolio value computed correctly for test user
3. behavioralQueue: triggered after trade POST
4. Redis pub/sub: message published to correct user channel
5. get_current_quote tool: returns price for valid symbol
6. get_my_holdings tool: returns only requesting user's holdings
7. get_my_trade_history tool: returns correct trades with userId filter
8. run_portfolio_stress_test tool: returns correct dollar impact
9. chat endpoint: responds with SSE content-type
10. chat endpoint: Claude is mocked, still returns structured stream
```

---

## PHASE 2F — CLOUD, OBSERVABILITY, POLISH
### Branch: feat/cloud-observability
### Estimated: 2 days
### Start AFTER Phase 2E is merged

### 1. AWS S3 — Trade History Backups

Install: `npm install @aws-sdk/client-s3`

File: src/services/s3Backup.js
```javascript
/**
 * AWS S3 integration for trade history backups.
 * Triggered: daily by BullMQ snapshot job.
 * Also: user-triggered export (download my data).
 * Bucket: nivesh-path-backups (create in AWS console free tier)
 */
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Export functions:
// backupUserTrades(userId) → uploads JSON to S3 as trades/userId/2026-10-05.json
// getUserExportUrl(userId) → generates presigned URL for download (valid 1 hour)
```

New API endpoint: GET /api/portfolio/export
- Calls backupUserTrades for current user
- Returns presigned URL for immediate download
- Shows in Portfolio page as "Download my data" button

Environment variables to add:
```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BACKUP_BUCKET=nivesh-path-backups
```

### 2. New Relic APM Setup

Install: `npm install newrelic`
File: newrelic.js (in project root — newrelic requires this exact location)

Configuration:
```javascript
exports.config = {
  app_name: ['Nivesh-Path'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: { level: 'info' },
  distributed_tracing: { enabled: true }
};
```

Add `require('newrelic')` as FIRST LINE of server.js.

What to track with New Relic:
- Response time for each API endpoint
- AI service call duration
- ChromaDB query times
- Database query times
- Error rates

### 3. Sentry DSN — Already hooked in Phase 1

Activate the Sentry integration:
```javascript
// Already in server.js as optional Sentry — make it active
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'production',
  tracesSampleRate: 0.1
});
```

For FastAPI (ai-service/main.py):
```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
sentry_sdk.init(dsn=os.environ.get("SENTRY_DSN"), integrations=[FastApiIntegration()])
```

### 4. Playwright Tests in CI

Add to .github/workflows/ci.yml:
```yaml
playwright:
  runs-on: ubuntu-latest
  needs: [jest, pytest]  # run after unit tests pass
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
    - run: npm ci
    - run: npx playwright install --with-deps chromium
    - run: docker compose up -d  # start all services
    - run: sleep 10  # wait for services
    - run: npx playwright test
    - uses: actions/upload-artifact@v4
      if: failure()
      with:
        name: playwright-report
        path: playwright-report/
```

### 5. Custom Domain

1. Get free .me domain from Namecheap (GitHub Student Pack)
2. Suggested: niveshpath.me or nivesh-path.me
3. In DigitalOcean App Platform: Settings → Domains → Add domain
4. In Namecheap: Add CNAME record pointing to DigitalOcean app URL
5. SSL: DigitalOcean provides free Let's Encrypt cert automatically
6. Update in README.md, CLAUDE.md, resume bullets, LinkedIn

### 6. Architecture Diagram (README.md)

Create architecture.md with:
- Full system diagram (ASCII or link to Excalidraw image)
- Data flow diagram: trade → ChromaDB → behavioral analysis
- News pipeline: Finnhub → BullMQ → Redis pub/sub → WebSocket → browser
- Upload architecture diagram image to GitHub, reference in README

### Phase 2F Tests
```
1. S3 backup: mock S3 client, verify PutObjectCommand called with correct key
2. S3 export URL: presigned URL generated with correct bucket and key
3. Playwright: full buy flow (login → dashboard → stock → buy → see in portfolio)
4. Playwright: AI advisor flow (navigate to advisor → analyze → see results)
5. Playwright: chat flow (send message → see streaming response)
6. Health check endpoint returns 200 with all service statuses
```

---

## ENVIRONMENT VARIABLES (complete list for .env.example)

```bash
# Server
NODE_ENV=production
PORT=3000
JWT_SECRET=change-this-to-random-64-char-string

# Database
MONGODB_URI=mongodb+srv://...

# Cache
REDIS_HOST=redis
REDIS_PORT=6379

# Market Data
FINNHUB_API_KEY=

# Payments (keep for reference, not used in buy flow anymore)
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=

# AI
ANTHROPIC_API_KEY=
OPENAI_API_KEY=  # optional fallback

# AI Service (internal)
AI_SERVICE_URL=http://ai:8001

# AWS
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=us-east-1
S3_BACKUP_BUCKET=nivesh-path-backups

# Monitoring
SENTRY_DSN=
NEW_RELIC_LICENSE_KEY=
NEW_RELIC_APP_NAME=Nivesh-Path

# Feature flags (optional)
ENABLE_WEBSOCKET=true
ENABLE_NEWS_PIPELINE=true
ENABLE_AI_CHAT=true
```

---

## DOCKER COMPOSE (target for Phase 2E)

```yaml
services:
  web:
    build: .
    ports: ["3000:3000"]
    environment:
      - NODE_ENV=production
      [all env vars]
    depends_on: [mongo, redis, ai]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s

  ai:
    build: ./ai-service
    expose: ["8001"]  # internal only, not public
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      [ai env vars]
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/health"]

  worker:
    build: .
    command: node src/workers/worker.js
    depends_on: [mongo, redis]
    environment: [same as web]

  mongo:
    image: mongo:7
    volumes: [mongo_data:/data/db]

  redis:
    image: redis:7-alpine
    volumes: [redis_data:/data]

volumes:
  mongo_data:
  redis_data:
```

---

## PHASE 2 SUCCESS CRITERIA (all of these must be true when done)

**Functionality:**
- [ ] Each user has a completely isolated portfolio and trade history
- [ ] Virtual $100,000 starting cash, updated on every trade
- [ ] All 5 core pages work in React/TypeScript
- [ ] Behavioral Mirror shows detected patterns with evidence
- [ ] Pre-trade warning appears before a qualifying bad trade
- [ ] Stress test shows accurate dollar impact with plain English explanation
- [ ] News alert appears in real-time when held symbol has news
- [ ] AI chat answers questions using real portfolio data, streams token by token
- [ ] Live prices update via WebSocket
- [ ] Trade history exports to S3, downloadable via presigned URL
- [ ] Custom domain live with HTTPS

**Engineering Quality:**
- [ ] 50+ automated tests total (all passing)
- [ ] Playwright E2E tests in CI pipeline
- [ ] GitHub Actions CI green on every push
- [ ] New Relic APM showing real response times
- [ ] Sentry capturing real errors in production
- [ ] Docker Compose starts all services with one command
- [ ] Architecture diagram in README

**Performance:**
- [ ] Dashboard loads in < 2 seconds
- [ ] AI chat first token appears in < 3 seconds
- [ ] Pre-trade check completes in < 1.5 seconds (non-blocking UX)

---

## RESUME BULLETS (update after each phase completes)

Phase 2A complete → add:
"Implemented per-user portfolio isolation with JWT middleware, virtual $100k
cash ledger (atomic MongoDB $inc operations), and server-side P&L calculation"

Phase 2C complete → add:
"Built Behavioral Mirror: Python analytics engine (pandas/numpy) that detects
panic-sell, FOMO, and overconcentration patterns in user trade history; LLM
generates personalized coaching narrative from structured pattern data"

Phase 2D complete → add:
"Shipped pre-trade bias detection with RAG retrieval of similar past trades and
portfolio stress testing using numpy correlation matrix — surfaces evidence-based
warnings before emotionally-driven trades execute"

Phase 2E complete → add:
"Implemented real-time news-to-portfolio impact pipeline: BullMQ jobs (every 5
min) → Finnhub news → Redis pub/sub → WebSocket push; streaming AI chat with
5 LangChain tools (get_quote, get_holdings, run_stress_test) via FastAPI SSE"

Phase 2F complete → add:
"Added AWS S3 trade history backups (presigned URL download), New Relic APM,
Sentry error tracking, Playwright E2E in CI; deployed to custom domain with
auto-HTTPS via DigitalOcean + Let's Encrypt"

---

## HOW TO WORK WITH CLAUDE CODE SESSION BY SESSION

Start of each Claude Code session:
1. Claude Code reads CLAUDE.md automatically
2. Say: "Continue Phase 2[X]. Check what's done, pick up where we left off."
3. Claude Code checks git log and existing files to understand current state
4. Builds the next logical piece

End of each session:
1. Run: `npm test` and `cd ai-service && pytest` — must be green
2. Commit with descriptive message
3. Push to feature branch
4. Note what's next in CLAUDE.md "Current progress" section

If Claude Code gets confused:
- Say: "Read CLAUDE.md from the top and the Phase 2[X] instructions"
- Show it the git log: `git log --oneline -20`
- Show it the file structure: `find src ai-service -name "*.js" -o -name "*.py" | head -30`


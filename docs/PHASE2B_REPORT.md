# Nivesh-Path - Work Report: Phase 2B (React + TypeScript app)

**Covers:** Step 0 (delete the `psk/` prototype) and all of Phase 2B.
**Merged to `main`:** PR #8 (merge commit `4bb3f53`), after all 10 CI checks passed.
**Tests now:** 79 Jest (backend) + 23 pytest (AI service) + 75 Vitest (React) + 1 Playwright end-to-end test.
**Overall size:** 131 files changed (+10,025 / -9,785 lines). Most of the deletions are the `psk/` prototype.
The new `frontend/` folder is 68 files (+9,258 lines).

---

## 1. Summary

| Step | What it did |
|---|---|
| Step 0: delete `psk/` | Removed the unused bolt.new prototype: other people's names, pages copied from Groww, the original AI prompt and 144 MB of videos |
| React app | All 12 pages rebuilt in React 18 + TypeScript + Tailwind, plus `/stock/:symbol` for any US ticker and a 404 page |
| Staged rollout | Old page URLs redirect to the new pages. Any page can be switched back to its old HTML version with one environment variable, without new code |
| Backend changes | Routes that clashed with the new page URLs removed, "delete a saved analysis" added, fake market data mode for tests |
| Tests + CI | 75 React tests, a real-browser end-to-end test in CI, and the Docker image now builds the React app |

---

## 2. Step 0: delete `psk/`

The root `psk/` folder was never served by the app, but anyone browsing the GitHub repo could see it. It contained:
- other people's names and pages copied from Groww;
- the original bolt.new AI prompt (`psk/.niveshpath/`);
- 144 MB of videos;
- a 14-month-old Vite starter.

What changed:
- The folder is deleted, and its references are gone from the Jest config, `.dockerignore`, README and CLAUDE.md.
- A test now fails if `psk/` ever comes back.

**Note:** the files still exist in git history. Removing them from history would mean rewriting `main` with a force-push. That is optional and was not done.

---

## 3. The React app (`frontend/`)

### Stack
| Part | Choice |
|---|---|
| Build | Vite 5 (output in `frontend/dist`; assets under `/static` so they never clash with the old `/assets` files) |
| UI | React 18, TypeScript (strict mode), Tailwind 3 with light and dark themes |
| Routing | React Router 6, each page loaded lazily |
| Server data | TanStack Query 5 (caching, background refresh, retries) |
| App state | Zustand (login, theme, toasts) |
| Charts | Recharts (allocation donut, price chart) |
| Icons | lucide-react, plus our own GitHub/LinkedIn SVGs |
| Tests | Vitest + Testing Library (unit and page tests), Playwright (real browser) |

### Pages
| Page | URL | Highlights |
|---|---|---|
| Landing | `/` | Logged-in users go straight to their portfolio |
| Login / Register | `/login`, `/register` | Login with email or mobile; returns you to the page you came from |
| Portfolio | `/portfolio` | Cash, invested, total value, P&L; allocation donut; sortable holdings (click a row to open the stock); AI memory panel |
| Transactions | `/transactions` | Filter by buy/sell, symbol search, date range, 25 per page, CSV export |
| AI Advisor | `/advisor` | Holdings pre-loaded and editable for what-ifs, risk profile, one-click questions, saved history (open or delete) |
| Stock | `/stock/:symbol` | Any US ticker: live price, chart, key stats, profile, news, buy/sell panel, watch button, similar stocks from the same sector |
| Markets | `/markets` | Search any ticker, index ETFs, top gainers/losers among the 12 featured stocks, 8 sector tabs (50 stocks) |
| Watchlist | `/watchlist` | Starred stocks with live prices |
| Account | `/account` | Profile, password, theme, reset paper money, delete account |
| What's new | `/whats-new` | Release notes and live system status (refreshes every 30 seconds) |
| About / Contact | `/about`, `/contact` | About + 5-question FAQ; contact form saved to MongoDB |
| Not found | any other URL | Friendly 404 page, served with a real 404 status |

### Design decisions
- **Types match the real API.** `frontend/src/types` was written from the actual Express and FastAPI responses, so the compiler catches any mismatch with the backend.
- **One API client.** Every call goes through `frontend/src/lib/api.ts`, which adds the login token. On a 401 it clears the session and sends you to `/login?redirect=...`.
- **Login is shared with the old pages.** Both use the same browser storage keys (`token`, `niveshPathUser`, `niveshPathTheme`), so users stay logged in when they move between old and new pages.
- **Theme:** light by default, then the theme saved on the user's account. The toggle saves the choice to the account.
- **Price chart decides itself.** If the Finnhub plan includes price history, the page draws its own chart. Otherwise it shows the official TradingView chart inside the page. This means `check-finnhub.js` is no longer needed to choose.
- **No fake content.** Gainers and losers are computed from the 12 featured stocks; there is no invented company description (Finnhub doesn't provide one).
- **Speed:** the main JavaScript bundle is about 88 KB gzipped. The chart library loads only on pages that need it.

---

## 4. Serving and staged rollout (`src/spa.js`)

The React app runs on the **same server and Docker image** as before. There is no new DigitalOcean component and no CORS setup.

- **Each React route lists the old URLs it replaces.** Those URLs now redirect permanently to it. For example:
  - `/portfolio.html` → `/portfolio`;
  - `/TSLA.html` and `/Tesla.html` → `/stock/TSLA`;
  - `/stock.html?symbol=xom` → `/stock/XOM`;
  - `/psk/pages/login.html?next=/advisor.html` → `/login?redirect=/advisor.html`.
- **Rollback without new code.** Setting `REACT_DISABLED=/markets,/stock` on the web component switches those routes back to the old HTML pages. This is documented in `docs/DEPLOYMENT.md`.
- **Safe fallback.** If the React build is missing, the old site is served unchanged.
- **API stays safe.** Nothing under `/api` is ever answered by the React app; unknown API paths still return JSON 404.
- **Old pages are kept** in `public/` as the rollback until the React app has run live for a while.

---

## 5. Backend changes

| Change | Why |
|---|---|
| Removed the old JSON routes `GET /stock/:symbol`, `GET /stock` and `/api/get-api-key` | `/stock/:symbol` is now a page URL. `/api/stocks/*` already covers the data |
| Removed the `GET /transactions` alias (`/api/transactions` stays) | Found by the browser test: it took over the `/transactions` page and showed "Authentication required" |
| Added `DELETE /api/ai/history/:id` | Lets users delete a saved analysis; only their own (filtered by user id) |
| Added `FAKE_MARKET_DATA=1` (`src/lib/fakeMarket.js`) | Gives stable made-up prices so CI needs no Finnhub key. `server.js` refuses to start with it in production |
| Unknown page URLs show the React 404 page | Before, they showed Express's bare "Cannot GET" text |

---

## 6. Testing

| Suite | Count | What it covers |
|---|---|---|
| Jest (backend) | 79 | Includes new tests for: React serving, every legacy redirect, rollback, API never swallowed, 404 fallback, fake market mode, delete-analysis |
| pytest (AI service) | 23 | Unchanged, still passing |
| Vitest (React) | 75 in 14 files | At least 5 per page: loading, data shown, errors, form validation, user actions |
| Playwright (real browser) | 1 smoke test | Sign up → $100,000 shown → search TSLA → buy 3 shares → holding in portfolio → trade in transactions → AI analysis → old URL redirects → log out |

**Browser check before merging:** I opened 15 pages at desktop and phone sizes, in light and dark themes (60 views in total).
- No page scrolls sideways and there are no JavaScript errors.
- The only console messages were Google Fonts being blocked by the test environment's network, plus the expected 404s.

---

## 7. CI and Docker

| Job | What it does |
|---|---|
| Backend tests (Node) | Jest, unchanged |
| AI service tests (pytest) | Unchanged |
| **React app (new)** | `npm ci`, typecheck, Vitest, production build |
| **End-to-end smoke test (new)** | Starts MongoDB, the real AI service (rule-based, no Claude key) and the web server with fake market data, then runs Playwright |
| Build Docker images | Now waits for the React job too |

**Dockerfile:** a two-stage build. The first stage builds `frontend/dist`, and the second stage copies it into the Node 22 server image. DigitalOcean deploys from this Dockerfile, so no settings change was needed.

**CI fix during the PR:** the first run failed the React typecheck because `playwright.config.ts` uses Node's `process`. Locally it passed because TypeScript found the Node types in the repo root's `node_modules`, which the CI job doesn't install. I added `@types/node` to `frontend/` (commit `b89a77b`) and confirmed the failure reproduces without the fix. CI then passed 10/10.

---

## 8. Docs updated
- `CLAUDE.md`: progress (2B done, 2C next), layout, stack, frontend commands, new UI rules.
- `docs/PHASE2_PLAN.md`: a "Phase 2B - React app (done)" section with every decision.
- `README.md`: stack table, how to run the React app, test commands.
- `docs/DEPLOYMENT.md`: how to roll a page back with `REACT_DISABLED`.
- `.env.example`: `REACT_DISABLED` and `FAKE_MARKET_DATA`.
- What's new: a Phase 2B release entry on both the React page and the old HTML page.

---

## 9. Not done / next
- **Old HTML pages** in `public/` are still there as the rollback. Delete them once React has been live without problems.
- **Lighthouse / performance numbers** have not been measured on the live site yet. Measure them before putting any in a resume.
- **Real-time prices (WebSocket)** are planned for Phase 2E.
- **Next phase: 2C Behavioral Mirror.** It will detect each user's panic sells, FOMO buys and holding habits from their own trades, and store the results in MongoDB via `PatternStore`.

## 10. To-dos for Sumit
1. Check the live site after the deploy: `/`, `/markets`, `/portfolio`, `/stock/AAPL`, plus an old URL such as `/TSLA.html` (it should redirect).
2. In DigitalOcean, add `MONGO_URL` to the **ai** component and delete `STRIPE_SECRET_KEY`.
3. Optional: `RESEND_API_KEY` + `CONTACT_TO_EMAIL` to get contact-form emails.
4. Optional: run `node scripts/check-finnhub.js` to see whether your Finnhub plan includes price history (the stock chart already adapts either way).

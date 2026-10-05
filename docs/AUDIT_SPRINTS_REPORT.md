# Nivesh-Path - Work Report: AI Memory Fix, Feature Pages and Audit Sprints 1-3

**Covers:** everything done after the Phase 2A verification and before Phase 2B (React).
**Merged to `main`:** PR #6 (ChromaDB persistence + feature pages) and PR #7 (audit sprints 1-3).
**Tests now:** 69 Jest (backend) + 23 pytest (AI service). Both PRs passed CI before merging.
**Overall size:** 189 files changed (+6,103 lines / -40,163 lines). Most of the deletions are copied, fake or unused files.

---

## 1. Summary

| Step | What it fixed | PR |
|---|---|---|
| AI memory persistence | ChromaDB is wiped on every DigitalOcean deploy. Trades are now rebuilt from MongoDB on startup, so the AI never forgets them | #6 |
| Feature pages | Built features were invisible. Added Portfolio, What's new and AI memory pages so each feature can be seen and used | #6 |
| Site audit | Scanned all 30 pages, every link, button and input. Report: "Nivesh-Path Site Audit" doc | none (report only) |
| Sprint 1: cleanup | Removed fake or copied content and other people's names. One shared layout. Stock pages rebuilt from one template | #7 |
| Sprint 2: save everything | Every value a user enters is now saved in MongoDB and comes back on any device | #7 |
| Sprint 3: stock data API | Real Finnhub data (key stats, profile, news, search) and 50 curated stocks; any US ticker can be traded | #7 |

---

## 2. AI memory persistence (PR #6)

**Problem:** DigitalOcean App Platform resets the container disk on every deploy, so the ChromaDB trade embeddings were lost each time.

**Fix:** MongoDB is now the source of truth, and ChromaDB is only a cache that can be rebuilt.

- **Startup rebuild** (`ai-service/startup.py`): on boot, a background thread re-embeds every user's trades from the `purchases` collection into their own Chroma collection.
  - Upserts are idempotent, so running it twice changes nothing.
  - If one user fails, the others still rebuild.
  - Progress shows on the AI service's `/health` as `vector_index`.
- **Lazy rebuild:** if a user's memory is missing when they ask the advisor, it is rebuilt for that user on the spot.
- **MongoDB access** (`ai-service/services/mongo_store.py`):
  - `TradeStore` reads trades and accepts `userId` as either an ObjectId or a string.
  - `PatternStore` writes the new `behavioral_patterns` collection: one document per (user, pattern type), with a unique index. It is ready for Phase 2C.
- **New endpoints** (Node proxies them through to the AI service):
  - `GET /api/ai/memory/{user_id}`
  - `POST /api/ai/memory/{user_id}/rebuild`
  - `DELETE /api/ai/memory/{user_id}`
- **Test:** clear Chroma, run the startup rebuild, and the advisor answers with that user's own history and no other user's.
- **Config:** the AI service now reads `MONGO_URL`. **This has to be added to the DigitalOcean `ai` component.**

## 3. Feature pages (PR #6)

- **`/portfolio.html`** replaces the fake `dashboard1.html`, which showed a Mastercard ad and made-up "connections". It shows:
  - cash, invested amount, total value and P&L;
  - an allocation donut chart;
  - holdings at live prices;
  - recent activity;
  - an **AI memory** panel (trades saved vs. trades the AI can recall, plus a "Re-sync" button).
- **`/whats-new.html`:** release notes with "Try it" links, a roadmap, and a **live system status** card (web, database, AI service, model, memory rebuild) fed by the new public `GET /api/status`.
- **AI Advisor:** shows how many of your trades the AI remembers, and labels which past trades it used for an answer.
- Login and sign-up now land on Portfolio.

## 4. Site audit (no code changes)

I crawled all 30 served pages as a logged-in user in a headless browser and recorded every link, button, input, saved value and outside request. I also read each page's JavaScript and the backend routes.

**Main findings, all fixed in Sprints 1-3:**
- Only 5 areas did real, saved work.
- The account page saved nothing to the database.
- The Groww footer was on 14 pages, and other people's names, 12 fake testimonials and false claims appeared across the site.
- TradingView cards sent users off the site.
- 6 Markets rows opened the Apple page.
- Stock pages showed hard-coded financial charts and called a `/yahoo` route that doesn't exist.
- The contact form went nowhere.
- Old prototype source files were publicly downloadable.

The planner answered 10 decisions. They were applied as given, except for the deviations listed in section 9.

---

## 5. Sprint 1 - cleanup (PR #7)

### Security
- The old bolt.new prototype was **publicly downloadable**:
  - `/psk/src`, `/psk/package.json`, the tsconfigs and `vite.config`;
  - `/psk/public/user-dashboard/`;
  - a hidden `/psk/.niveshpath/` folder containing the **bolt.new AI prompt**.
- All of it is deleted. Static files are now served with `dotfiles: "deny"` and `index: false`.

### Deleted
- **Pages:** `products.html`, `pricing.html`, `support.html`, `success.html`, `cancel.html` (Stripe), `demo.html`, `footer.html`, `dashboard1.html`.
- **Media:** about 150 MB of unused videos (`vd1-3.mp4`), plus team photos and unused images.
- **Dead scripts:** 12 copied per-company JS files and 12 per-company CSS files, plus old scripts (`client.js`, `search.js`, `main.js`, `dashboard.js`).

### Other people's content removed
- **Names and photos:** Dhrumil, Viraj, Harsh and Dhruval, removed from the footer, the About team section, commented-out code and image files. The WhatsApp image is gone too.
- **12 made-up testimonials.**
- **False claims:** "India's leading stock broker", "10+ Million clients", "15% of daily retail volume", ₹ brokerage pricing, mutual funds.
- **Placeholder contact details:** phone +1012 3456 789, demo@gmail.com, and a Boston address.
- **A test now fails** if any of these names or "Groww" appear anywhere under `public/`.

### One shared layout
- `public/assets/nivesh.js` renders the **top bar, sidebar and footer** into empty placeholders on every page (`data-np-nav`, `data-np-sidebar`, `data-np-footer`), so there is only one copy of each.
- **Sidebar:** Markets, Portfolio, Transactions, AI Advisor, Watchlist, What's new, Account. The confusing "Home", "Stocks", "Insights" and "Help" items are gone.
- **Top bar:** Markets, Portfolio, AI Advisor, What's new, About, plus either Log in / Sign up or an initials avatar.
- **Footer:** Product links, Project links (About & FAQ, Contact, GitHub, LinkedIn), and the line "© 2026 Nivesh-Path · A project by Sumit Parmar · Educational, not financial advice". It follows light/dark mode.
- **AI Advisor and Account** now use the same layout. Before, there were three different navbars.

### Stock pages
- The **12 stock pages are generated from one template** (`scripts/stock-page.template.html` with `scripts/gen-stock-pages.py`) and named by ticker: `AAPL.html`, `TSLA.html`, `AMZN.html`, and so on.
- **Old URLs 301-redirect**, for example `/Tesla.html` → `/TSLA.html`, `/Amazone.html` → `/AMZN.html`, `/index.html` → `/AAPL.html`.
- **One shared `public/assets/stock-page.js`** replaces 12 copied scripts.
- **Removed:**
  - the hand-typed revenue/profit charts (and Chart.js);
  - the broken `/yahoo` Volume call;
  - the Indian "Upper/Lower circuit" fields;
  - the TradingView news widget;
  - the leftover Stripe script.
- **Spelling fixed:** "Microsoft Crop", "Nvidia crop.", "Wallmart", "Amazone INC", "StarBucks".
- **Walmart's broken TradingView card:** Walmart moved its listing from NYSE to NASDAQ, so the chart now uses `NASDAQ:WMT`.
- **The page now shows:**
  - a header with logo, name, price, change and a ⭐ Watch button;
  - an embedded TradingView chart (inside the page, never as a link);
  - Buy/Sell with cash available;
  - "Your position" (shares, average cost, value, P&L);
  - Today (low/high bar, open, previous close, change);
  - Key stats, the company profile, the latest 5 news items, and "More stocks".
- **`/stock.html?symbol=XOM` opens any US ticker** with the same template (see section 9).

### Markets (`/search.html`)
- Rebuilt with our own cards and rows. **Every click opens our stock page; nothing links to TradingView.**
- **Search** works for any NYSE/NASDAQ ticker, with arrow-key navigation and Enter to open.
- **Sections:**
  - "Popular right now" cards;
  - top gainers and losers;
  - "Browse by sector": 8 tabs, 50 stocks.
- The 6 rows that opened the Apple page are fixed, and the logo/name overlap is fixed with a fixed-width grid.

### Landing, About, login and sign-up
- **Landing:** rewritten around the real product.
  - Paper trading with $100k, an AI advisor that cites your trades, and "trading DNA" coming next.
  - A live price strip from our own quotes and a "How it works" section.
  - The TradingView widgets and generic "Bank-grade security" cards are removed.
- **About:** "A project by Sumit Parmar, MS CS at UB", why the project exists, the tech stack, GitHub and LinkedIn links, and a **5-question FAQ** (real money? where prices come from? financial advice? how many stocks? free?).
- **Login:** accepts **email or mobile**. The fake social-login icons and the non-working "Forgot password" link are removed.
- **`/`** now redirects to the landing page instead of the Apple stock page.

---

## 6. Sprint 2 - every value saved to MongoDB (PR #7)

### New or changed models
- `User`: added `settings { theme, language, notifications }`. The profile fields already existed but were never written.
- `Analysis` `{ userId, question, riskProfile, holdings, result, createdAt }`
- `Watchlist` `{ userId, symbol, addedAt }`, unique on (userId, symbol)
- `Message` `{ userId?, name, email, subject, message, read, emailed, createdAt }`

### New endpoints
All of them use `requireAuth` and filter by `req.user.id`, except contact.

| Endpoint | What it does |
|---|---|
| `PATCH /api/me` | Update name, nickname, email, mobile, country, city, address. Email and mobile must be valid and unique (409 if taken) |
| `GET/PATCH /api/me/settings` | Theme (light/dark), language, notifications |
| `POST /api/me/password` | Change password after checking the current one (bcrypt) |
| `GET /api/me/avatar` | Initials avatar as an SVG, with a colour derived from the name |
| `DELETE /api/me` | Needs the password and the word "DELETE". Removes the user, trades, watchlist, analyses and AI memory |
| `POST /api/portfolio/reset` | Needs the word "RESET". Deletes the user's trades and sets cash back to $100,000 through `ledger.reset()`, under the per-user lock |
| `GET /api/ai/history`, `GET /api/ai/history/:id` | Every advisor run is saved; owner only (404 for anyone else) |
| `GET/POST /api/watchlist`, `DELETE /api/watchlist/:symbol` | Watchlist, synced across devices, max 100 items |
| `POST /api/contact` | Public, rate-limited to 5 per hour per IP. Saved to MongoDB first, then emailed through Resend if it is configured |

Login now returns the saved settings, so the theme follows the user to a new device.

### Pages wired to these endpoints
- **Account:** rebuilt in the shared layout.
  - A profile form saved to the database, with an initials avatar.
  - A light/dark theme switch saved to the account.
  - Change password.
  - "Reset paper account to $100,000" and "Delete account", each behind a typed-confirmation dialog.
  - Log out.
- **Contact:** a working form. It is pre-filled for logged-in users and shows real GitHub and LinkedIn links.
- **Watchlist (new page):** live prices, add a ticker, remove one. The ⭐ on every stock page uses the same data.
- **AI Advisor:** a "Past analyses" list (click to reopen), one-click question chips, and "Load my holdings".

### Data map: before → after

| Value | Before | Now |
|---|---|---|
| Name, email, mobile, password | MongoDB | MongoDB (and editable) |
| Nickname, country, city, address | Browser only | MongoDB |
| Profile photo | Browser only, as a large text string | Initials avatar generated by the server |
| Theme | Browser only | MongoDB (`settings.theme`) |
| Password change | Not possible | `POST /api/me/password` |
| AI analyses | Lost on refresh | MongoDB `analyses` + history |
| Watchlist | Did not exist | MongoDB `watchlists` |
| Contact message | Not saved or sent | MongoDB `messages` + Resend email |
| Reset / delete account | Did not exist | Endpoints + Account page |
| Trades, cash, P&L | MongoDB | Unchanged |

---

## 7. Sprint 3 - stock data API (PR #7)

- **`src/lib/marketData.js`** (Finnhub, called through our server, so the key never reaches the browser):

  | Data | Endpoint | Cache | Notes |
  |---|---|---|---|
  | Quote | `/quote` | 60s | Normalised to price, change, %, open, high, low, previous close |
  | Profile | `/stock/profile2` | 24h | Name, logo, industry, exchange, country, IPO date, market cap, website. ETFs fall back to the curated name |
  | Key stats | `/stock/metric` | 1h | Market cap, P/E, EPS, 52-week high/low, beta, dividend yield, 10-day average volume |
  | News | `/company-news` | 1h | Latest 5; only http(s) links are kept |
  | Search | `/search` | 1h | US tickers only (foreign listings like XOM.SW are dropped); exact match first |
  | Candles | `/stock/candle` | 1h | Returns `{available:false}` if the plan doesn't include them, instead of failing |

  If the provider rate-limits us (429), the API returns 503. With no API key, it returns 503 rather than crashing.
- **Routes:**
  - `GET /api/stocks/curated`
  - `GET /api/stocks/search?q=`
  - `GET /api/stocks/quotes?symbols=` (at most 20 symbols)
  - `GET /api/stocks/:symbol/quote|profile|metrics|news|candles`
- **Curated list:** 50 stocks and ETFs in 8 sectors (`src/config.js` `CURATED`). This is the planner's 46 plus INTC, CRM, KO and PEP to reach 50. ETFs: SPY, QQQ, VTI, IWM, DIA.
- **`scripts/check-finnhub.js`:** run it once with the real key to see which endpoints the plan allows, especially candles.
- **Used by:** stock pages (key stats, profile, news, quote), Markets (search, sectors, quotes) and Watchlist (quotes).

---

## 8. Testing

- **Jest: 38 → 69 tests.** New tests cover:
  - legacy redirects;
  - prototype files not being served;
  - no other names or Groww text in `public/`;
  - profile, settings, password, avatar, watchlist, reset, delete, analysis history and contact (saved and emailed; still saved when email fails);
  - **per-user isolation** on all of them;
  - Finnhub mapping and caching, the ETF fallback, unsafe news links being dropped, and **the API key never leaking**.
- **pytest: 13 → 23.** New tests cover the cold-start rebuild, idempotency, the lazy rebuild, missing or failing MongoDB, the memory endpoints, and deleting memory for one user only.
- **Browser end-to-end test (Playwright),** run against a local copy with fake Finnhub data. All steps passed:
  1. Sign up and land on Portfolio.
  2. Markets search "xom", then the Exxon page (8 key stats, profile, 5 news items).
  3. Watch, then Buy 3 shares; "Your position" updates.
  4. Open `/Tesla.html` (redirected) and buy.
  5. Watchlist: add, then remove.
  6. Advisor: a chip question is saved to history.
  7. Account: profile and dark theme saved to the database; password changed; reset to $100k (0 trades left).
  8. Contact message sent.
  9. Delete account, after which login is refused.
- **Layout:** no horizontal overflow on 13 pages at 1366, 1024 or 390 px. Dark mode checked.

### Not verified yet (needs the live site)
- Real Finnhub responses with the production key. All tests used fake Finnhub data.
- How the TradingView chart looks. It was blocked in the test environment.
- Real email sending, because Resend is not configured yet.

---

## 9. Deviations from the plan (and why)

1. **Pages built in HTML instead of waiting for React.** The plan said to build new pages only in React. Markets, Account, Watchlist and Contact had to be rebuilt anyway to remove the fake content and connect them to the new endpoints. The new markup is small and uses the shared layout, so Phase 2B can port it directly.
2. **`/stock.html?symbol=` added now.** All stock pages come from one template driven by `data-symbol`, so a page for any ticker cost almost nothing. That makes the 50 curated stocks and search results tradeable today. Phase 2B's `/stock/:symbol` route replaces this page.
3. **Stock pages named by ticker** (`TSLA.html`), not `/stock/TSLA` yet. `/stock/:symbol` is still the public JSON quote route used by older code. The clean URL belongs to 2B.
4. **Language and Notifications are hidden in the Account UI.** Both are saved by the API, but the site has no translations and sends no notifications, so showing the switches would be fake.
5. **Owner email is not shown publicly.** About and Contact show GitHub and LinkedIn; email goes through the contact form, to avoid spam. The owner links live in one place: `OWNER` in `public/assets/nivesh.js`.

---

## 10. What the owner needs to do

- [ ] Add `MONGO_URL` (same value as on web) to the DigitalOcean **ai** component, so AI memory is rebuilt after each deploy.
- [ ] Optional: create a Resend account and add `RESEND_API_KEY` and `CONTACT_TO_EMAIL` to the **web** component so contact messages are emailed. Without them they are still saved in MongoDB.
- [ ] Run `node scripts/check-finnhub.js` locally and share the output (does the plan include candles?).
- [ ] Check the live site after deploy: Markets search, a stock page with real data, the watchlist star, the Account theme, AI history.
- [ ] Still pending from earlier: custom domain, rotate the MongoDB password, delete `STRIPE_SECRET_KEY` from DigitalOcean.

---

## 11. Notes for Phase 2B (React + TypeScript + Tailwind)

- **Pages to port** (their backends already exist):
  - Markets, stock page (`/stock/:symbol`), Portfolio, Transactions;
  - AI Advisor (with history), Watchlist, Account, What's new;
  - About/FAQ, Contact, login/sign-up.
- **Reusable as-is:**
  - all `/api/*` endpoints;
  - the `CURATED` list;
  - `NP.stocks` and `NP.stockUrl` logic;
  - the shared layout content (sidebar items, footer text).
- **Redirects:** when React serves `/stock/:symbol`, add redirects from `/<TICKER>.html` and `/stock.html?symbol=`, and move the JSON quote route off `/stock/:symbol`. Existing callers already have `/api/stocks/:symbol/quote`.
- **Price chart:** if `check-finnhub.js` shows candles are available, draw our own chart from `/api/stocks/:symbol/candles`. Otherwise keep the embedded TradingView widget.
- **Phase 2C detectors** must write to `PatternStore` (MongoDB `behavioral_patterns`), not ChromaDB.

---

## 12. Key files

- **Backend:**
  - `src/app.js` (routes, legacy redirects, static options)
  - `src/config.js` (`CURATED`, email config)
  - `src/lib/marketData.js`, `src/lib/mailer.js`, `src/lib/ledger.js` (`reset`)
  - `src/routes/account.js`, `watchlist.js`, `contact.js`, `ai.js` (history), `stocks.js`, `purchases.js` (reset)
  - `src/models/User.js`, `Analysis.js`, `Watchlist.js`, `Message.js`
- **AI service:**
  - `ai-service/startup.py`
  - `ai-service/services/mongo_store.py`
  - `ai-service/main.py` (lifespan, memory endpoints)
  - `ai-service/services/vector_service.py`
- **Frontend:**
  - `public/assets/nivesh.js` (shared layout, session helpers, stock list)
  - `public/assets/stock-page.js`, `public/markets.js`, `public/watchlist.js`, `public/advisor.js`
  - `public/psk/js/account.js`, `contact.js`, `login.js`, `signup.js`, `landing.js`
- **Scripts:** `scripts/gen-stock-pages.py`, `scripts/stock-page.template.html`, `scripts/check-finnhub.js`
- **Tests:** `tests/app.test.js`, `ai-service/tests/test_cold_start.py`
- **Docs:** `CLAUDE.md`, `docs/PHASE2_PLAN.md` (implementation notes), `README.md`, `docs/DEPLOYMENT.md`, `.env.example`

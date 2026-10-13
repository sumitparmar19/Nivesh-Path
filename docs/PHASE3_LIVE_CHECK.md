# Phase 3: full check of every page, feature and service

**Date:** Oct 13, 2026 · **Checked:** `main` at `d5fbf6b` (what is live), then the fixes on top of PR F.
**Asked for by:** "Phase 3: complete status so far, and a full check of the live site", Part 2.

## 0. Summary

1. **The live site itself could not be reached from this session.** The cloud environment's network policy blocks `nivesh-path-vzeak.ondigitalocean.app` (HTTP 403 at the proxy). Everything in this report was therefore run against the same code built for production on a local server:
   - Postgres ledger, as live;
   - MongoDB 7;
   - the AI service running rule-based, with no Claude key;
   - made-up prices (`FAKE_MARKET_DATA=1`; no Finnhub key here).

   The live run is one click away (§5). I did not invent live numbers.
2. **Every feature works.** 50 of 54 checks passed. The 4 warnings are explained in §2 and none is a bug.
3. **Bugs found: 3, all fixed with tests.**
   - **Delete account landed on the login page.** It is already on `main`.
   - **Pages jumped while loading.** Lighthouse CLS was 0.6–0.75 on phones.
   - **A PR F test would fail on any date after Oct 12.** This was a test bug, not a site bug.
4. **UX list:** 15 items, ranked, **not implemented** (§4). Sumit picks.
5. **Phone width (375 px):** across 15 pages, there is no sideways page scroll, no "undefined", "NaN" or raw JSON, and no console error from the app.

## 1. Automated checks (Part 2.2)

| Check | Result |
|---|---|
| Backend Jest on `main` (real Postgres) | **187 passed** |
| React Vitest on `main` | **112 passed**; typecheck clean; build OK |
| AI service pytest on `main` | **54 passed** |
| Playwright smoke on `main`, `FAKE_MARKET_DATA=1` | **2 passed** with the Postgres ledger, **2 passed** with the Mongo ledger |
| CI on `main` (`d5fbf6b`) | **CI run #94 green**: backend + Postgres 18 service, pytest, React, both e2e ledgers, Docker, gitleaks. **Infra run #7 green**: Terraform fmt/validate, Checkov, ShellCheck |
| Keys in the browser bundle | **None.** I scanned `frontend/dist` (972 KB) for `sk-ant`, `re_…`, `glc_…`, JWT-shaped strings, Finnhub-shaped keys, `mongodb://`, `postgres://` and the names of every secret variable. The only hits were 20-digit numbers inside the chart library. `public/` only has a credit link to finnhub.io |

**After the fixes** (PR F + this work): Jest **222**, Vitest **120**, pytest **55**, Playwright 2 + 2 smoke passed. The 10 new live-smoke tests are skipped in CI by design.

## 2. Every page and feature (Part 2.3)

Local production build, Postgres ledger, a new test user, browser time zone America/Los_Angeles.

| Area | Check | Result | Evidence |
|---|---|---|---|
| Public pages | `/`, `/about`, `/contact`, `/whats-new`, `/markets` | ✅ | All 200 with their h1 ("Trade smarter. Know your patterns.", …) |
| | Unknown URL | ✅ | 404 status and the "Page not found" page |
| | Legacy URLs | ✅ | `/search.html`, `/AAPL.html`, `/Tesla.html`, `/stock.html?symbol=nflx`, `/psk/pages/login.html`, `/portfolio.html`, `/whats-new.html`: all 301 to the right React page |
| Status | `/health`, `/api/status` | ✅ | `{"status":"ok","db":"connected","ai":true}`; ledger `postgres`, trading not paused, AI reachable |
| | What's new | ⚠️ local only | Shows "Money ledger: PostgreSQL (Neon)" and "Done at last restart, Oct 12, 11:33 PM". The badge says "Partly degraded" only because there is no Claude key here. On live it should say "All systems go"; the live test checks that |
| Auth | Protected page while logged out | ✅ | `/portfolio` → `/login?redirect=%2Fportfolio` |
| | Register | ✅ | Lands on `/portfolio` with **$100,000.00** |
| | Wrong password | ✅ | "Invalid mobile number or password" (wording: UX item 9) |
| | Log in | ✅ | Returns to the redirect target (`/watchlist`) |
| Markets | Curated list | ✅ | 21 rows with prices |
| | Search | ✅ | TSLA found |
| | Made-up tickers | ✅ | FOMO/DROP are not in the curated list (they exist only with `FAKE_MARKET_DATA=1`, which production refuses) |
| Stock detail | AAPL | ✅ | Profile, price, key stats, news section, price chart; order total 2 → $266.84, 4 → $533.68 |
| | Watch button | ✅ | AAPL appears in the watchlist |
| Trading (Postgres) | Buy 10, sell 4 | ✅ | Holding 6; Postgres `trades` count 0 → 1 → 2 |
| | Sell more than held | ✅ | "You own 6 AAPL shares, so you can't sell 50." |
| | Buy above cash | ✅ | "Insufficient funds: this order costs $13,342,000.00 but you have $99,199.48." |
| | **Double-click Buy** | ✅ | **Exactly one trade:** API 2 → 3, Postgres 2 → 3 |
| | Same `Idempotency-Key` twice | ✅ | 201, then 200 `replayed: true` |
| Behavioral Mirror | Flag in the trade panel | ✅ | Shown in **149 ms**: "Behavioral Mirror: fomo buy. You bought FOMO at $100.00 after it rose 18.0% in 5 days…" |
| | Mirror page | ✅ | Scores 80 / 100 and 99 / 100; the pattern card appears |
| | Got it | ✅ | Unread 1 → 0 |
| | Acknowledge-all, delete | ✅ | Both 200; patterns 1 → 0 |
| | Insight | ✅ | Coach answered (rule-based here) and was saved |
| Portfolio | Totals and chart | ✅ | Cash $97,787.20, matching the API; 4 holdings; allocation chart |
| | Reset | ✅ | Tested in the Jest suite ("reset puts cash back to $100k and clears only the caller's trades"); not clicked here, so the walk could carry on |
| Transactions | History | ✅ | 6 rows. Times are in the browser's time zone: "Oct 12, 2026, 11:33 PM" for a trade at 06:33 UTC |
| Advisor | Analyze | ✅ | One run, rule-based here: "Risk: low … 4 positions worth $2,212.80 … plus $97,787.20 in cash" |
| | History | ✅ | List 1, open 200, delete → 0 |
| | Memory | ✅ | Status 200 (6 trades in the database, 6 indexed); rebuild 200 |
| Watchlist | Add, list, remove | ✅ | AAPL listed; NVDA added by search, then removed |
| Account | Profile | ✅ | City saved |
| | Theme | ✅ | Dark saved to settings |
| | Avatar | ✅ | 200 `image/svg+xml` |
| | Password | ✅ | Old password 401, new password 200 |
| | **Delete account** | ❌ → ✅ | **Bug 1** (§3). After the fix: lands on `/` with "Account deleted"; login afterwards 401 |
| Contact | One message | ✅ | "Message received! Sumit will get back to you by email." No email was sent here, because there is no Resend key |
| Security | `/internal/*` | ✅ | `/internal/trades/users` 404; `/internal/trades` with a wrong token 404; `/internal/jobs/held-tickers` 404 |
| | Isolation | ✅ | A second user sees 0 trades, 0 patterns, 0 analyses of the first |
| | Headers | ⚠️ | HSTS, nosniff, `X-Frame-Options` and `Referrer-Policy` are present; `X-Powered-By` is absent. **No Content-Security-Policy:** it is switched off in `src/app.js` (UX item 13) |
| | Secrets in pages | ✅ | Bundle scan (§1). No key appears in any response |
| Observability | Grafana | not checkable here | This session can't reach Grafana or the live site. Sumit's check is in §5 |
| Cleanup | Test users gone | ✅ | After **Delete account** in the UI: Mongo `users`, `purchases`, `watchlists`, `analyses`, `behavioral_events` and `behavioral_patterns` have 0 rows for the user; Postgres `accounts` 0 and `trades` 0. The contact message stays in `messages` (it is Sumit's inbox) |

**About the 4 warnings:**
- What's new: no Claude key in this session (see the table).
- CSP: a decision for Sumit (UX item 13).
- Console and network: the 4xx lines are the deliberate wrong-password, oversell and over-budget checks, plus the 404 page. The font errors come from this sandbox's proxy, which re-signs HTTPS.

## 3. Bugs, root causes, fixes

### Bug 1: after "Delete my account" you landed on the login page (on `main`, so live too)
- **Seen:** the account and every row were deleted, but the browser ended on `/login?redirect=%2Faccount` instead of the home page with "Account deleted". It reproduced 2 times out of 2 on `main`'s build.
- **Cause 1:** a race. `/account` sits inside `RequireAuth`. The page signed out first, so `RequireAuth` re-rendered on `/account` with nobody signed in and sent the user to login before the move home happened (React Router 6 with `v7_startTransition`).
- **Cause 2:** `client.clear()` made the still-mounted Account queries refetch with the deleted user's token. The 401 that came back ran the "session expired" path, which also jumped to login.
- **Fix:**
  - The page goes home first with `state: { signedOut: true }`; the home frame (`PublicLayout`) finishes the sign-out and then drops that flag from the history entry.
  - `beginSignOut()` removes the token at once and stops a late 401 from redirecting, until the next log-in.
  - Expired sessions still go to login; a test covers that.
- **Tests (Vitest):**
  - "after deleting the account you land on the home page, not on the login page" uses the real `RequireAuth` + `PublicLayout` and failed before the fix;
  - an expired token still redirects;
  - a late 401 while signing out doesn't redirect, and logging in resets that.
  - One existing assertion changed: the isolated Account test no longer expects the sign-out on that page, because it now happens on the home page; the new test checks it end to end.
  - The live smoke test passed 5 runs out of 5 after the fix.

### Bug 2: the page jumped while loading (Lighthouse CLS 0.6–0.75 on phones)
- **Cause:** while a page's code loaded (`React.lazy`), the footer was drawn near the top and then pushed down. Logos had no width or height. A signed-in visit to `/` drew the public frame before redirecting to the portfolio.
- **Fix:**
  - the loading placeholder holds a full screen of height;
  - logos and stock icons declare their size;
  - `PublicLayout` redirects a signed-in visitor to `/portfolio` before drawing.
- **Tests:** logos carry `width`/`height`; the placeholder has `min-h-screen`; a signed-in visitor to `/` reaches the portfolio without the public footer.
- **Result:** §4.3. Mobile CLS is 0.09 or lower on every page measured; desktop is 0.12 or lower.

### Bug 3: a PR F test failed on any date after Oct 12 (test bug, fixed on PR #18)
- **Cause:** "snapshot during market hours is skipped" faked "now" as Oct 12, 1 pm New York but took the quote's trade time from the real clock. On Oct 13 the quote looked like a later day's close, so it was saved.
- **Fix:** the trade time is pinned to Oct 12, 12:59 pm New York (commit `4c0b8b0`, pushed to PR #18). The app code was correct.

## 4. UX and quality (Part 2.4)

### 4.1 Phone width and browser console
- **Coverage:** 15 pages at 1280 px and at 375 px:
  - 9 public pages: `/`, about, contact, what's new, markets, `/stock/AAPL`, login, register, 404;
  - 6 signed-in pages with data;
  - the 6 signed-in pages again for a brand-new user (empty states);
  - 9 pages in dark mode.
- **Sideways page scroll:** none on any page at any width.
- **"undefined", "NaN", "Infinity", "[object Object]", raw JSON:** none on any page.
- **Console:** no app errors. The only lines were the 404 page's own status and Google Fonts failing through this sandbox's proxy.
- **Menu at 375 px:** logged out, the ☰ menu opens and navigates. Logged in, the top tab strip scrolls sideways (UX item 14).
- **Trade panel at 375 px:** usable. The Buy button is 301 × 40 px.
- **Empty states:**
  - Portfolio: a welcome banner and "No holdings yet" with "Browse markets".
  - Mirror: "No patterns detected" with "Find a stock to trade".
  - Advisor, Transactions and Watchlist each show an empty-state message.
- **Themes:** light and dark are both readable.

**Screenshots** are in `docs/screenshots/` (JPEG):
- **Public pages:** home, markets, `/stock/AAPL` at desktop and phone width, plus What's new.
- **Signed-in pages:** portfolio, transactions and Mirror at both widths; advisor and watchlist at desktop. They appear in dark mode, the test user's saved theme.
- **Empty states:** portfolio and Mirror for a new user.

They come from the local run, so **prices are made up (`FAKE_MARKET_DATA=1`)**. The only "personal" data is the test user "Live Check".

### 4.2 Text and numbers
- **Money:** `$` with 2 decimals and thousands separators everywhere checked.
- **Dates and times:** "Oct 12, 2026, 11:33 PM" (local time) on Transactions, Portfolio and the Mirror.
- **Exceptions:** both are UX items:
  - the stock page's "Listed since 1990-01-01";
  - the rule-based coach text, which shows only without Claude.

### 4.3 Lighthouse (local production build, Lighthouse 12, simulated mobile and desktop)

These numbers come from a local server with no network delay, so they are **not** the live numbers. Use the live run (§5) for the portfolio site.

| Page | Before (`main`): Perf · A11y · BP · SEO · CLS | After the fixes: Perf · A11y · BP · SEO · CLS |
|---|---|---|
| **Mobile** `/markets` | 77 · 95 · 100 · 100 · 0.62 | **100** · 95 · 100 · 100 · **0.005** |
| **Mobile** `/stock/AAPL` | 76 · 97 · 100 · 100 · 0.76 | **94** · 97 · 100 · 100 · **0.087** |
| **Mobile** `/portfolio` | 77 · 95 · 100 · 100 · 0.62 | **97** · 95 · 100 · 100 · **0** |
| **Mobile** `/` (logged out) | CLS 0.75 (footer 0.67) | **68–87** · 95 · 100 · 100 · **0.001** |
| **Desktop** `/markets` | 89 · 95 · 100 · 100 · 0.22 | **98** · 95 · 100 · 100 · 0.086 |
| **Desktop** `/stock/AAPL` | 86 · 97 · 100 · 100 · 0.28 | **99** · 97 · 100 · 100 · 0.051 |
| **Desktop** `/portfolio` | 87 · 95 · 100 · 100 · 0.26 | **97** · 95 · 100 · 100 · 0.109 |
| **Desktop** `/` (logged out) | 86 · 95 · 100 · 100 · 0.29 | **92** · 95 · 100 · 100 · 0.103 |

- **Why mobile `/` varies (68–87):** its largest text waits for Google Fonts. The fonts CSS blocks rendering for about 0.9 s, and in this sandbox the font download sometimes retries. That is UX item 7.
- **Accessibility misses** (UX items 4–6):
  - colour contrast;
  - heading order in the footer;
  - the Watch button's name.

### 4.4 UX list: ranked, NOT implemented (Sumit picks)

1. **Transactions on a phone:** the table's Stock, Qty, Price and Total columns are cut off, and the user has to scroll sideways inside the card to see what was traded. Show each trade as a stacked row below about 640 px.
2. **Holdings on a phone:** Value, P&L and Weight are hidden off to the right of the table. Same fix: stacked rows, or Stock + Value + P&L only.
3. **Stock page on a phone:** the trade panel comes last, after the chart, key stats, about and news. Move it right under the price on small screens.
4. **Contrast** (Lighthouse accessibility 95–97):
   - white text on brand green `#16a34a` is 3.29:1, below the 4.5:1 that small text needs (Sign up and Create account buttons, small badges);
   - green links are 3.09–3.29:1;
   - muted grey `#64748b` on `#f6f8fb` is 4.47:1.

   Use `brand-700` for buttons and small green text and `slate-600` for muted text.
5. **Watch button name:** its accessible name "Add AAPL to watchlist" doesn't contain the visible word "Watch", which trips up voice control. Use "Watch AAPL" / "Stop watching AAPL".
6. **Footer heading order:** h3, then h4, with no h2 (Lighthouse "heading-order"). Use one heading level, or styled `<p>`s.
7. **Self-host the two fonts** (Inter, Plus Jakarta Sans) instead of Google Fonts. This removes about 0.9 s of render-blocking on phones and a third-party request.
8. **Mirror, 375 px:** "Overconcentration" breaks mid-word ("Overconcentr / ation") in the small count tile. Use "Concentration", or a smaller label.
9. **Login error:** it says "Invalid mobile number or password" even when an email was typed. Say "Wrong email/mobile or password".
10. **Market cap shown twice** on the stock page (Key stats and About). The two come from different Finnhub fields and can disagree (in the local data: $100.00B vs $114.36B). Show it once. Also "Listed since 1990-01-01" should use the site's date style ("Jan 1, 1990").
11. **Rule-based coach text** (only when Claude is unavailable) reads like a log line: "0 panic sell(s)", "[high severity]", "2026-10-12 10:59 PM". Tidy the wording.
12. **Deleting a pattern changes the Impulse-control score.** After deleting the FOMO flag, the score read "6 of your 6 checked trades had no panic or FOMO flag". Decide whether delete means "this flag was wrong" (current behaviour) or should only hide the card and keep it counted.
13. **Content-Security-Policy is off** (`helmet({ contentSecurityPolicy: false })`). Adding one means allow-listing Google Fonts (or self-hosting, item 7), the TradingView chart and the stock logos. It's a hardening step, not a bug.
14. **Logged-in phone menu:** the top tab strip is cut at the right edge ("Transactio…") with no hint that it scrolls. Add a fade at the edge, or a ☰ menu like the logged-out one.
15. **Empty portfolio:** "No holdings yet" appears as the title and again in the sentence under it.

## 5. Steps for Sumit

No configuration needs to change because of this check. To finish the **live** part, use **one** of these.

### Option A, from GitHub (after the live-check PR is merged)
1. GitHub → **Actions** → **Live smoke test** → **Run workflow**.
2. Leave the site as it is.
3. Tick **"Also run ONE AI analysis"** (one Claude call).
4. Tick **"Also send ONE contact-form message"** (one real email to you).
5. Click **Run workflow**.
6. When it finishes, send me the run link.

What it does: it creates `e2e-live-<number>@example.com`, checks every page and feature, makes small paper orders (buys 2 + 1 AAPL, sells 1 + 1), and finally **deletes the user**. If a step fails, it still deletes the user.

### Option B, give this session access to the site
1. In this session's title bar: the cloud environment menu → **Edit** → **Network access**.
2. Add `nivesh-path-vzeak.ondigitalocean.app` under **Allowed domains**.
3. Leave **Allow package managers** ticked, then save.
4. Tell me, and I run the same test plus the screenshots and Lighthouse against live.

The steps are on https://code.claude.com/docs/en/cloud-environments#network-access.

### During or right after the run
1. **Grafana:**
   - Explore → Tempo: search for `POST /api/store-purchase` (or `/api/trades`) in the last 15 minutes. The trace should show **Services 2** (web → `nivesh-ai POST /api/ai/transactions`).
   - Logs (`{service_name="nivesh-web"}`) should carry `trace_id`.
   - The dashboard's request panel moves.
   - No alert email arrives.
2. **DigitalOcean:** both components **Active**; no red errors in the web or ai Runtime Logs during the run. After the live-check PR deploys, each component's Runtime Logs start with `Telemetry: exporting over OTLP as nivesh-web` (web) and `… as nivesh-ai` (ai).
3. **Test user gone:**
   - In the web Console, run `node scripts/db-check.js`. Accounts and trades should be back to the numbers before the run (1 account and your own trades).
   - In Atlas → Browse Collections → `users`, filter `{ "email": { "$regex": "^e2e-live-" } }`. The result should be empty.
4. **Neon:** project healthy; storage and compute well inside the free limits.
5. **Email:** if you ticked the contact box, the test message arrived.

## 6. Monitoring asks from the report (done)
- **Service name in the start-up line.** Both services now log `Telemetry: exporting over OTLP as <name>` (`src/telemetry.js` `startupLine()`, `ai-service/telemetry.py` `startup_line()`). Each has a test.
- **Troubleshooting note.** `docs/OBSERVABILITY.md` §5c covers "Services 1": check `OTEL_SERVICE_NAME` per component, the start-up line, the two console checks, and the bracketed-paste tip.
- **Part 1 evidence** is now in `docs/PHASE3_LIVE_STATUS.md`. It covers accounts, configuration, what Sumit did, issues 1–9, the monitoring evidence and what's still open. Hostnames, user names and the Grafana stack name are left out.

## 7. Live runs (GitHub "Live smoke test" workflow)

| Run | When (UTC) | Result |
|---|---|---|
| [#1](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38457449171) | Oct 13, 19:46 | 7 passed, 1 failed (account), 2 not run |
| [#2](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38469289309) | Oct 13, 21:16 | Same as run #1 |

**Passed on the live site, both runs (tests 1–7):**
- public pages, legacy redirects, `/api/status` (ledger `postgres`, AI configured), What's new ("All systems go");
- `/internal/*` returns 404, security headers are set, no keys in the page;
- register, wrong password, log in;
- markets and stock detail, with real Finnhub data;
- trading on the Postgres ledger: buy, sell, both clear errors, **double-click Buy gives exactly one trade**, and the same `Idempotency-Key` is replayed;
- portfolio, transactions, Mirror, watchlist;
- advisor memory, and **one Claude analysis per run** (15–17 s).

**Bug 4, found by the live runs:** the Account page let you type into the profile fields before the profile had loaded. When it arrived, it replaced what you had typed. The test typed "Buffalo" into City right after opening the page; on live the profile arrives a moment later, so the saved city was empty. A slow connection does the same to a real person. Locally the profile loads instantly, so the local run passed.
- **Fix:** the profile fields stay locked until the profile has loaded. The live test also waits for the profile before typing.
- **Test:** a Vitest test checks that the fields are locked while loading. It fails without the fix.

**Not reached in either run:** the contact email (test 9), deleting the test user (test 10), and the theme and password steps of test 8. Each run's safety net deleted its test user at the end through `DELETE /api/me`, because the password hadn't changed yet. Sumit can confirm with the Atlas filter in §5.

**Claude calls used:** 2 (one per run), which is the limit the check set. The next run leaves the AI box **unticked**.

## 8. Limits
- **Live runs reached tests 1–7** (§7). The account, contact and delete steps run on live once the bug 4 fix is deployed.
- **Real Finnhub data and Claude:** covered by the live runs only (§7). The local run used made-up prices and the rule-based AI.
- **Grafana couldn't be checked from here.**
- **Lighthouse ran on a local server.** Live numbers will be lower on the first load, because they include network latency.

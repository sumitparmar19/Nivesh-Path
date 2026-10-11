# Phase 3 · Part 1 (A1) full report: PR A + PR B, for review before merging PR B

**For:** Sumit, and the planning chat, to check everything before PR B is merged.
**Scope:** Part 1 · A1 "Move the money ledger from MongoDB to PostgreSQL", plus your additions to the "Go" message.
**Repo state:**
- `main` at `4928e7d` has **PR A merged** ([#12](https://github.com/sumitparmar19/Nivesh-Path/pull/12)).
- **PR B is open** ([#13](https://github.com/sumitparmar19/Nivesh-Path/pull/13), head `ffed89a`), with CI fully green.
**Live site:** still on the **MongoDB** ledger (`LEDGER_BACKEND=mongo` default). Nothing about money changes until you run the cutover.

---

## 0. Summary

| | PR A (merged) | PR B (open, green) |
|---|---|---|
| What | Postgres ledger next to MongoDB, behind a switch; database-enforced rules; row locks; retry-safe orders; maintenance pause; AI reads trades through Node; secret scan; MIT license | The one-time move: copy tool (`--dry-run / --migrate / --verify / --export-since`), cutover runbook, "Money ledger" on What's new |
| Files | 50 files, +2,754 / −196 | 15 files, +773 / −6 |
| Tests | 279 → 310 | 310 → 324 |
| Live effect | None until you set variables (site behaves as before) | None until you run the runbook |
| CI | All 7 jobs green (both push and PR runs) | All 7 jobs green (both push and PR runs) |

**Totals:** Jest 132 → 167, pytest 39 → 46, Vitest 106 → 109, Playwright 2 (now run on **both** ledgers).
**No existing test was edited.**

---

## 1. What you asked for, and where it stands

**Your "Go" message**
- **D1–D9 as recommended:** applied.
  - D1: whole shares.
  - D2: maintenance-pause cutover.
  - D3: DigitalOcean pre-deploy migration job.
  - D4: users stay in MongoDB.
  - D5–D9: not reached yet (later PRs).
- **D10 MIT license:** `LICENSE` added and `package.json` set to `"license": "MIT"`.
- **Addition 1, security:**
  - a gitleaks full-history scan in CI;
  - "rotate the MongoDB Atlas password and update it everywhere" is **Step 1** in your list, before anything else (so also before Part 2).
- **Addition 2, separate Atlas users** for live / jobs / demo, each `readWrite` on its own database only: the click-by-click steps are in your list (see §9). There's one consequence for PR F; see question Q1.
- **Addition 3, PR grouping:** A and B stay separate; C+D will be one PR; H+I will be one PR.
- **Addition 4, keep building while you're blocked:** PR B was built while PR A waited. PR C+D is next.
- **Addition 5, reports start with your steps:** both PR reports do (`docs/PHASE3_PR_A_REPORT.md`, `docs/PHASE3_PR_B_REPORT.md`).

**A1 requirements from the Phase 3 file**

| # | Requirement | Status | Where |
|---|---|---|---|
| 1 | Prisma + Prisma Migrate; migrations committed; `migrate deploy` runs before the new version serves traffic | ✅ Done. Prisma 6.19.3; `prisma/migrations/20261011225621_ledger_init`; DigitalOcean **PRE_DEPLOY** job `migrate` (you add it in the App Spec editor, Step 4) | `prisma/`, `.do/app.yaml` |
| 2 | Money never a float; rounding of old values documented | ✅ `NUMERIC(14,2)` cash/total, `NUMERIC(14,4)` price, Prisma `Decimal` in code. The move rounds half-up and **lists every changed value** | `schema.prisma`, `ledgerMigration.js` |
| 3 | CHECK cash ≥ 0, quantity > 0, price > 0, foreign keys, a rule that stops a double-submitted trade | ✅ All, plus total > 0, side ∈ {buy, sell}, price source, ObjectId format; FK with cascade; `UNIQUE(user_id, idempotency_key)` | `migration.sql` |
| 4 | Row lock (`SELECT … FOR UPDATE`) in an interactive transaction; test: 20 parallel buys never overspend | ✅ 20 parallel $10,000 buys **across two app instances** → exactly 10 fill, cash $0.00 | `ledgerStore.pg.js`, `tests/ledger.pg.test.js` |
| 5 | Users, AI memory, behavioral events, PatternStore, watchlist, messages stay in MongoDB; rows reference users by id as text | ✅ Postgres stores the 24-character MongoDB user id (and keeps each trade's MongoDB id) | `schema.prisma` |
| 6 | Switch **every** reader of trade data, including the AI start-up rebuild (via an internal Node endpoint protected by `AI_INTERNAL_TOKEN`) | ✅ All readers go through one ledger store. The AI service reads `/internal/trades*` | §3.2, §3.4 |
| 7 | `scripts/migrate-ledger.js` with `--dry-run`, `--verify`, safe to rerun, per-user report matching to the cent; MongoDB untouched | ✅ (PR B), plus `--migrate` and `--export-since` (for rollback) | §4 |
| 8 | docker-compose Postgres; CI Jest against a real Postgres container | ✅ Both. CI also checks the schema matches the migrations, runs e2e on Postgres, and boots the built image on Postgres | §5 |

**A1 acceptance**
- All existing tests pass: ✅ (none edited).
- New tests for:
  - constraints ✅
  - parallel buys ✅
  - idempotent retry ✅
  - migration script: dry-run ✅, verify ✅, re-run ✅
  - reset/delete removing Postgres rows ✅
  - the AI memory rebuild through the new path ✅
- Live after the move (same cash/holdings/history, verify report attached, new trade + Mirror works): ⏳ **this is your cutover** (§9). I can't reach the live site.

**Not in these PRs (by plan):** A2 observability and A3 k6 come in PR C+D.

---

## 2. Security findings (from the new secret scan)

The full-history gitleaks scan found **real credentials in the repo's first commit** (`e666745`):
- `.env`:
  - a MongoDB Atlas connection string (user **`dhrumil`** on cluster **`niveshpathcluster.egrir`**);
  - a **Finnhub API key**;
  - a **Stripe secret key**.
- `demo.js:729` and `public/client.js:282`: the same MongoDB URL.

How it's handled:
- **They're public in git history, so the fix is to rotate them, not delete them.** Rewriting history doesn't remove copies in clones, forks or caches. Rotation is Step 1 of your list.
- **`.gitleaksignore` lists exactly those 5 old findings**, so CI passes on them. **Any new secret fails the build.** I confirmed a planted MongoDB URL is caught.
- **gitleaks' default rules have no MongoDB rule**, so `.gitleaks.toml` adds one. It allowlists documentation placeholders (`<db_password>`, `YOURPASS`, …) and local hosts (`mongo`, `localhost`).
- **The CI job pins gitleaks 8.30.1 and checks the download's SHA-256.** It scans every commit (`fetch-depth: 0`) and redacts findings in logs.
- **The `dhrumil` user may be a former teammate's.** If that cluster isn't in your Atlas account, its owner has to rotate it. Either way your live site moves to a new `nivesh-live` user.

---

## 3. PR A in detail (merged as `4928e7d`)

### 3.1 Postgres schema (`prisma/`)
**`accounts`:**
- `user_id` varchar(24), primary key (the MongoDB user id);
- `cash` NUMERIC(14,2);
- `total_deposited` NUMERIC(14,2);
- timestamps.

**`trades`:**
- `id` char(24): the **same id as the MongoDB trade** (new trades get a fresh ObjectId string). Behavioral Mirror events, saved analyses and AI memory keep pointing at the right trade. This was blocking issue 1 in the review.
- `user_id` → accounts (FK, cascade delete);
- `symbol`, `side` ('buy'/'sell');
- `quantity` INTEGER (whole shares, D1);
- `price` NUMERIC(14,4), `total` NUMERIC(14,2);
- `price_source`, `behavior_checked_at`, `idempotency_key`, `executed_at`.

**Constraints:**
- CHECKs written by hand in the migration SQL, because Prisma can't express them:
  - cash ≥ 0, total_deposited ≥ 0;
  - quantity > 0, price > 0, total > 0;
  - side and price_source values;
  - ObjectId format on all three id columns.
- `UNIQUE(user_id, idempotency_key)` and an index on `(user_id, executed_at)`.

**Prisma setup:**
- `binaryTargets` include `linux-musl-openssl-3.0.x` for the Alpine Docker image (blocking issue 5).
- `url` is the pooled connection (Neon + `pgbouncer=true`); `directUrl` is the direct connection, for migrations only.

### 3.2 One ledger, two stores (`src/lib/`)
- **`ledgerStore.js`** picks the store from `LEDGER_BACKEND` (`mongo` default | `postgres`). Unknown values refuse to start.
- **`ledgerStore.mongo.js`:** today's logic, moved unchanged (User.cashBalance with atomic `$inc`, the `purchases` collection, the per-user in-process lock), plus the idempotency replay. This is the rollback path.
- **`ledgerStore.pg.js`:** each order is **one transaction**:
  1. ensure the account exists (opened with the user's MongoDB balance the first time);
  2. `SELECT … FOR UPDATE` on the account row;
  3. look up the idempotency key (after taking the lock, so a racing retry sees the committed trade);
  4. check cash / shares owned;
  5. insert the trade;
  6. update cash.

  Money stays `Decimal` until the JSON response.
- **`ledger.js`** now only validates and prices:
  - symbol;
  - side;
  - **whole-share quantity, max 1,000,000** (new);
  - Idempotency-Key format;
  - live price with the client price as fallback (unchanged).

  It hands the order to the store. It also builds summary and holdings and does reset.
- **Every reader switched** to `ledger` / `ledger.store`:
  - trade, history, holdings, cash/summary, reset (`routes/purchases.js`);
  - Advisor holdings, cash and memory count (`routes/ai.js`);
  - pattern scores and the card's trade time/size lookup (`routes/patterns.js`);
  - account delete (`routes/account.js`);
  - `GET /api/me` cash (`routes/auth.js`, Postgres mode);
  - the Behavior detector's "checked" mark (`behaviorDetector.js`);
  - the start-up clean-up (`behaviorMigration.js`).
- **Holdings and average cost are still computed in JS** (`buildHoldings`, fold in time order), from either store. The review mentioned SQL `GROUP BY`. Average cost depends on the order of buys and sells, so the existing fold is the correct one and is kept.

### 3.3 Retry-safe orders (Idempotency-Key)
- **Both trade UIs send `Idempotency-Key`:** React `TradePanel.tsx` via `api.ts`, and legacy `public/assets/trade.js`.
  - The key is **reused only while the same order is retried after an unclear failure** (network error or 5xx).
  - A success or a 4xx (e.g. not enough cash) starts a new key.
- **Server side:**
  - a repeat with the same key returns **200 `{replayed: true}` with the original trade**, with no second charge, no Behavioral Mirror run and no AI ingest;
  - keys are per user, 8–100 characters of `[A-Za-z0-9_-]`; anything else is a 400;
  - MongoDB got a matching partial unique index on `purchases`.

### 3.4 Maintenance switch, internal API, AI service
- **`LEDGER_MAINTENANCE=1`:** Buy/Sell, Start over and Delete account answer **503** "Trading is paused for a few minutes while we upgrade the ledger…". Reads keep working. It's used during the cutover.
- **`/internal/trades/users` and `/internal/trades?userId=`** (`src/routes/internal.js`):
  - They exist **only if `AI_INTERNAL_TOKEN` is set**.
  - Every request needs the token in `X-Internal-Token`, compared in constant time. A user's JWT is not enough.
  - Every failure is the same JSON 404.
  - Read-only, rate-limited, `userId` must be 24-hex.
  - This fixes blocking issue 2: the web component is public, so an open endpoint would have leaked any user's trades.
- **AI service** (`ai-service/services/web_trades.py`):
  - `HttpTradeStore` reads trades from those endpoints. It's used when `WEB_INTERNAL_URL` + the token are set; otherwise it reads MongoDB directly as before.
  - The boot rebuild retries while the web service is still starting (2/4/8/16/30 s).
  - A token mismatch fails fast with a clear log line.
  - `httpx` is now a pinned runtime dependency, and per-request httpx logs are quieted (they printed user ids).

### 3.5 Server, Docker, DigitalOcean, docs
- **`server.js`:**
  - refuses to start with an unknown `LEDGER_BACKEND`, or with `postgres` and no `DATABASE_URL`;
  - logs `Ledger: mongo|postgres`;
  - the start-up clean-up uses the active store;
  - on SIGTERM, finishes requests and closes the Prisma and MongoDB pools.
- **`Dockerfile`:** copies `prisma/` before `npm ci`, whose postinstall runs `prisma generate`, and ships `scripts/db-check.js`. I tested it as the `node` user on Alpine: migrate, one query, and boot on Postgres all work.
- **`docker-compose.yml`:** a Postgres 16 service with a healthcheck; the backend runs `prisma migrate deploy` before starting.
- **`.do/app.yaml`** (the reference copy; DigitalOcean doesn't read it automatically):
  - the `migrate` PRE_DEPLOY job;
  - `LEDGER_BACKEND=mongo` on web;
  - `WEB_INTERNAL_URL=${web.PRIVATE_URL}` on ai.
- **`scripts/db-check.js`:** one Prisma query. It prints the server version, the applied migrations and the account/trade counts. It prints no secrets.
- **Docs and config:** `.env.example` (all new variables explained), `CLAUDE.md`, plan notes, What's new entry "Orders that can't go through twice", and a roadmap line.

### 3.6 PR A tests (279 → 310)

**Jest +22**
- 8 in `app.test.js` (MongoDB mode):
  - idempotent replay, with no second charge or ingest;
  - malformed key, fractional and huge quantities refused;
  - maintenance 503 on trade, reset and delete, while reads keep working;
  - unknown backend refused;
  - `/internal` doesn't exist without a token;
  - the token is required (a JWT is not enough, near-miss tokens fail);
  - the trade shape is correct;
  - the constant-time compare.
- 14 in `tests/ledger.pg.test.js` against real Postgres:
  - DB refuses negative cash, quantity/price/total ≤ 0, an unknown side, non-ObjectId ids, orphan trades;
  - **20 parallel $10k buys across two app instances → 10 fill, 10 "Insufficient funds", cash $0.00**;
  - 10 parallel 1-share sells with 5 owned → exactly 5;
  - a retry returns the original trade;
  - **5 simultaneous copies of one order → 1 trade**;
  - keys are per user;
  - 10 × $10.01 leaves exactly 99,899.90;
  - whole shares only;
  - the account opens from the MongoDB balance, and an unknown user gets 401;
  - history, holdings and `/internal` read Postgres;
  - Mirror marks are stored in Postgres;
  - reset and delete remove the rows (and the MongoDB copy on delete);
  - maintenance mode.

**pytest +7** (`test_web_trades.py`):
- the token header is sent;
- no request is made for non-user ids;
- the boot rebuild waits for the web service;
- a wrong token fails fast;
- it gives up after the retries;
- a one-user rebuild works;
- the trade source is chosen correctly.

**Vitest +2:**
- the key is reused after a network error and changes after success;
- a 4xx or a different order gets a new key.

**Playwright:** the same 2 browser tests now run twice, on the Mongo and the Postgres ledger. The Postgres run uses the AI service reading through `/internal`.

**Planted bugs:**
- Removing `FOR UPDATE` made 10 sells succeed with only 5 shares owned (a real oversell). Buyers also got 500 errors instead of "Insufficient funds".
- Disabling the replay charged a retry twice.

Both were caught; details are in the PR A report.

---

## 4. PR B in detail (open, #13)

### 4.1 The move tool
`src/lib/ledgerMigration.js` holds the logic as plain functions. `scripts/migrate-ledger.js` is the command you run in the DigitalOcean Console.
- **`--dry-run`** writes nothing. Per user it shows the cash and the trade count, then lists:
  - **every rounding change** (cash and totals to cents, prices to 4 places, half-up);
  - stored totals that differ from price × quantity. These are kept, because the stored total is what actually moved the cash.
  - **blocking problems**:
    - fractional shares (D1);
    - price or quantity ≤ 0;
    - an unknown side;
    - a symbol that isn't a ticker;
    - negative cash.

  It exits 1 if anything blocks.
- **`--migrate`** copies each user in one transaction:
  - The account gets the MongoDB cash (users from before the ledger existed get $100,000, as the site treats them today).
  - Trades keep their MongoDB ids.
  - Old company-name rows (`Tesla`) are stored as tickers (`TSLA`).
- **Safety rails:**
  - It refuses if anything blocks.
  - It refuses unless `LEDGER_MAINTENANCE=1`.
  - It refuses while `LEDGER_BACKEND=postgres` (`--force` overrides both, for tests).
  - **It refuses any user who already has Postgres-only trades** (a "conflict"; their newer cash is never overwritten).
- **Reruns:** safe (rows are keyed by MongoDB id, so nothing is duplicated). A rerun picks up trades and Mirror marks added since the last run.
- **`--verify`** checks, per user:
  - cash to the cent;
  - the exact set of trade ids;
  - holdings per stock (share count exact, cost basis within $0.01, computed from the raw MongoDB rows exactly as the live site does);
  - the number of checked trades.

  It ends with `All users match (N)` or `MISMATCH`, and exits 1 on any difference.
- **`--export-since <time>`** lists Postgres trades after a time. Those are what MongoDB is missing after a rollback.
- **Not copied, and counted:**
  - rows without a user (from before per-user accounts, invisible to everyone);
  - trades of deleted accounts.
- **MongoDB is only ever read.** Output shows user ids and amounts, never emails or secrets.

### 4.2 Visible in the UI
- `/api/status` now includes `ledger: {backend, tradingPaused}`. It makes no database call, because the status panel polls every 30 s and would keep Neon awake.
- What's new shows **"Money ledger: MongoDB / PostgreSQL (Neon)"**. During the copy it shows an amber "trading paused for an upgrade".
- There's a new What's new entry, "See where your money lives".

### 4.3 Runbook and fixes
- **`docs/LEDGER_CUTOVER.md`:**
  1. dry run;
  2. pause;
  3. migrate + verify;
  4. switch (one save);
  5. checks;
  6. rollback;
  7. what the script guarantees.
- **Jest now runs test files one at a time** (`"jest": {"maxWorkers": 1}`). The two Postgres suites share one test database, and plain `npx jest` ran them in parallel so they wiped each other's tables. `npm test` was already serial, and CI was never affected.
- **The CLAUDE.md test command was fixed:** `prisma migrate deploy` needs `DIRECT_URL` too.

### 4.4 PR B tests (310 → 324)

**Jest +13** (`tests/ledgerMigration.pg.test.js`, plus 1 status test)
- 4 pure tests:
  - rounding (`187.43999999999998` → `187.4400`; cash `99899.89999999999` → `99899.90`);
  - the blocking list;
  - a stored total kept and reported;
  - CLI arguments.
- 8 against Postgres:
  - copy + verify;
  - rerun safety;
  - a rerun picks up new trades and marks;
  - **verify catches a 1-cent difference and a missing trade, naming the user**;
  - the conflict is refused with cash untouched;
  - blocking problems write nothing;
  - `--export-since`;
  - **the portfolio summary from Postgres is identical to the one from MongoDB**.
- 1 status test: `/api/status` reports the ledger and the pause.

**Vitest +1:** the "Money ledger" row and the paused warning.

**Manual run:** I ran every mode against a real MongoDB 7 and Postgres 16:
1. dry run;
2. migrate refused without maintenance;
3. migrate;
4. verify "All users match (2)";
5. rerun (0 copied, still matching);
6. refused under `postgres`;
7. export.

**Planted bug:** removing the conflict check made the conflict test fail. The user would have been "updated", and their newer Postgres cash overwritten with the older MongoDB balance.

---

## 5. CI (`.github/workflows/ci.yml`)

| Job | What it does now |
|---|---|
| Backend tests (Node + Postgres) | Postgres 16 service → `prisma migrate deploy` → **schema-vs-migrations drift check** → `npm test`. The Postgres suites **must** run (`REQUIRE_PG_TESTS=1`); they can't silently skip |
| Secret scan (new) | gitleaks 8.30.1 (SHA-256 checked), full history |
| AI service tests | pytest (unchanged job) |
| React app | typecheck, Vitest, build (unchanged job) |
| End-to-end (now ×2) | Playwright on the **mongo** ledger and on the **postgres** ledger; the AI service reads through `/internal` |
| Build Docker images | builds the image, then **inside it** runs `prisma migrate deploy` + `db-check` and boots it with `LEDGER_BACKEND=postgres`; publishes to GHCR from `main` only |

`main` has no branch protection, so renaming jobs couldn't block merges.

---

## 6. Where I differed from the instructions or the review (please confirm)

1. **Unit tests use a MongoDB-store wrapper around the existing in-memory fakes,** not a separate "in-memory store" as the review said. It's the same goal (all old tests unchanged) with less new code. The real-Postgres suites cover the Postgres store.
2. **Holdings stay a JS fold, not SQL `GROUP BY`** (see 3.2). Average cost after partial sells depends on the order of buys and sells.
3. **`/internal` returns 404, not 401,** when the token is missing or wrong, so the endpoints can't be discovered.
4. **A retried Idempotency-Key with a *different* order body returns the original trade.** Some APIs return an error instead. The UIs only reuse a key for the identical order. See question Q3.
5. **The AI service no longer reads `purchases` directly once `WEB_INTERNAL_URL` + token are set,** for either ledger. That way the rebuild path is proven before the cutover.
6. **`--migrate` and `--export-since` were added** beyond the required `--dry-run` / `--verify`.
7. **`/api/status` doesn't ping Postgres** (Neon free plan sleeps; polling would keep it awake and eat compute hours). It reports which ledger is configured, not database health. Health monitoring comes with PR C.

## 7. Process notes, said plainly
- **I merged PR A when you said "ok then merge it",** before you'd confirmed PR A's steps 1–3. It's safe:
  - `LEDGER_BACKEND` defaults to `mongo`;
  - `/internal` doesn't exist without the token;
  - the migration job only exists once you add it.

  So the live site behaves exactly as before. The steps still need doing.
- **I pushed PR B once before my local test run finished cleanly.** The failures were from my sandbox: its Postgres had been wiped by a container restart, and then the two Postgres test files ran in parallel. Nothing was wrong with the code, and CI was green. The parallel-run problem is now fixed in the repo (4.3).
- **I can't reach** the live site, Neon, DigitalOcean or Atlas. Every live check is yours.

---

## 8. Limits
- **After a rollback,** trades made on Postgres aren't in MongoDB. `--export-since` lists them; there's no automatic copy back (Q2).
- **The MongoDB store's lock is per process** (fine for one web instance). The Postgres store's row lock works across instances.
- **Login, register and profile-update responses still carry MongoDB's `cashBalance`.** No page displays it (cash on screen comes from `/api/portfolio/*`, and `GET /api/me` is corrected). It goes away in the D-cleanup PR.
- **After the cutover, "Start over" resets Postgres only.** The MongoDB copy stays as a backup. Delete account removes both.
- **The `migrate` pre-deploy job builds the image a second time,** so deploys get longer. I can't measure how much from here.
- **Neon's free plan sleeps after 5 idle minutes,** so the first query afterwards is slower. It matters after the cutover and for the PR C alert thresholds.
- **AI rebuild:** one request per user (fine at this size).
- **Idempotency keys never expire** (fine at this size).

---

## 9. Your steps, all in one place (all in a browser)

Never paste a password, key or connection string into any chat. They go only into Atlas, Neon, DigitalOcean or GitHub screens.

**PR A, now (it's already merged and deployed):**
1. **Rotate the leaked credentials** (`docs/PHASE3_PR_A_REPORT.md` Step 1 has every click):
   1. In Atlas, create `nivesh-live` (`readWrite` on your live database only).
   2. Build the new connection string and update `MONGO_URL` on **web** and **ai** in DigitalOcean (Encrypt on).
   3. Check the site works, then **delete `dhrumil`**.
   4. Create `nivesh-demo` (`readWrite` on `niveshpath_demo`) and `nivesh-jobs` (`readWrite` on `niveshpath_jobs`).
   5. Regenerate the **Finnhub** key and update `FINNHUB_API_KEY` on web.
   6. **Roll the Stripe** secret key.
2. **Neon:** create the project (AWS US East). Copy the **pooled** URL (add `&pgbouncer=true`) and the **direct** URL.
3. **`AI_INTERNAL_TOKEN`:** generate it in the web Console. Put the same value on web and ai.
4. **App Spec editor:** add `LEDGER_BACKEND=mongo` + `DATABASE_URL` (SECRET) on web, `WEB_INTERNAL_URL=${web.PRIVATE_URL}` on ai, and the `migrate` PRE_DEPLOY job with `DATABASE_URL` + `DIRECT_URL` (SECRET). The exact YAML is in the PR A report. Check that the job log ends with "All migrations have been successfully applied."
5. **Checks:**
   - `node scripts/db-check.js` → `"ok":true` with the `ledger_init` migration;
   - What's new: AI memory rebuild "ok";
   - buy 1 share.

**PR B, after you say "merge":**

6. **Dry run:** `node scripts/migrate-ledger.js --dry-run`. Send me the output.

**Cutover** (`docs/LEDGER_CUTOVER.md`, about 5 minutes):

7. Pause: `LEDGER_MAINTENANCE=1`.
8. Run `--migrate`, then `--verify`, which must end with "All users match". Keep the output for the PR.
9. Switch: `LEDGER_BACKEND=postgres` and delete `LEDGER_MAINTENANCE`, in one save. Note the time.
10. Check:
    - What's new shows "Money ledger: PostgreSQL (Neon)";
    - your portfolio is unchanged;
    - a new trade and the Mirror work.

Rollback = `LEDGER_BACKEND=mongo`.

---

## 10. Questions to confirm with the planning chat
- **Q1. `nivesh-jobs` scope.** With `readWrite` on `niveshpath_jobs` only (as you asked), the nightly job (PR F) can't write live users' Behavioral Mirror events. My plan: the job sends them to a new token-protected internal endpoint on the web service, so rule code stays in Node. The alternative is giving `nivesh-jobs` access to the live database. **Which do you want?**
- **Q2. Rollback copy-back.** Should `migrate-ledger.js` get a `--copy-back` mode (Postgres → MongoDB for trades after the switch)? With one active user, redoing a few trades by hand is simpler. **My recommendation: not needed.**
- **Q3. Idempotency mismatch.** Same key with a different order body: return the original trade (current) or a 422 error? **My recommendation: keep it as is.**
- **Q4. Timing.** OK to leave the MongoDB ledger code in place for about a week after the cutover, then remove it in a small D-cleanup PR (MongoDB data stays as a backup)?
- **Q5. Next.** OK to start PR C+D (OpenTelemetry → Grafana Cloud + k6) now, while you do the steps above? It needs your Grafana Cloud account only for the live part.

## 11. Files (for reference)

**PR A (50 files):**
- Root and CI: `.gitleaks.toml`, `.gitleaksignore`, `LICENSE`, `.env.example`, `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml`, `.do/app.yaml`, `package.json` (+lock), `server.js`
- Prisma: `prisma/schema.prisma`, `prisma/migrations/…`
- `src/`: `app.js`, `config.js`, `lib/{db,ledger,ledgerStore,ledgerStore.mongo,ledgerStore.pg,behaviorDetector,behaviorMigration}.js`, `routes/{internal,purchases,ai,patterns,account,auth}.js`
- `models/Stock1.js`, `scripts/db-check.js`, `public/assets/trade.js`
- `ai-service/`: `config.py`, `main.py`, `startup.py`, `services/web_trades.py`, `tests/test_web_trades.py`, requirements
- `frontend/`: `TradePanel.tsx`, `api.ts`, `types/index.ts`, `releases.ts`, `StockDetail.test.tsx`
- Tests: `tests/app.test.js`, `tests/ledger.pg.test.js`
- Docs: `CLAUDE.md`, `docs/PHASE2_PLAN.md`, `docs/PHASE3_REVIEW.md`, `docs/PHASE3_PR_A_REPORT.md`

**PR B (15 files):**
- `src/lib/ledgerMigration.js`, `scripts/migrate-ledger.js`, `tests/ledgerMigration.pg.test.js`, `tests/app.test.js`, `src/app.js`, `Dockerfile`, `package.json`
- `frontend/`: `WhatsNew.tsx` (+test), `types/index.ts`, `releases.ts`
- Docs: `docs/LEDGER_CUTOVER.md`, `docs/PHASE3_PR_B_REPORT.md`, `CLAUDE.md`, `docs/PHASE2_PLAN.md`

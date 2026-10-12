# Phase 3 · PR A report: Postgres ledger foundation + secret scan

**Status:** built and tested. The live site keeps running on the MongoDB ledger (`LEDGER_BACKEND=mongo`) until the PR B cutover. Postgres gets its tables but no data yet.
**Plan and decisions:** `docs/PHASE3_REVIEW.md` (D1–D9 as recommended, D10 = MIT).

---

## 1. Your steps, in order (all in a browser)

Never paste a password, key or connection string into chat. They go only into DigitalOcean, Atlas, Neon or GitHub screens.

### Step 1 · Kill the leaked credentials (do this first, before merging)

The secret scan found real credentials in the repo's **first commit** (`e666745`, files `.env`, `demo.js`, `public/client.js`):
- a MongoDB Atlas user **`dhrumil`** on cluster **`niveshpathcluster.egrir`**;
- a Finnhub API key;
- a Stripe secret key.

They are in public history, so deleting the files doesn't help. Only rotating them does.

**1a. First, find out which cluster your live site uses.** DigitalOcean doesn't show encrypted values, so ask the app:
- DigitalOcean → your app → **Console** → **web** → run:
  ```
  node -e "const u=new URL(process.env.MONGO_URL); console.log(u.username, u.hostname)"
  ```
- It prints the user name and the cluster host, never the password, e.g. `dhrumil niveshpathcluster.egrir.mongodb.net`.
- **If that cluster is in your own Atlas account:** do 1b on it.
- **If it belongs to someone else** (for example a former teammate's `niveshpathcluster`):
  - only its owner can delete `dhrumil`. Ask them to.
  - create a free cluster in **your own** Atlas account, and do 1b there.
  - moving the data across is a separate step; tell me and I'll write it up. Atlas has a "Migrate data" tool, and `mongodump`/`mongorestore` also work.

**1b. MongoDB Atlas: one user per environment, then delete `dhrumil`** (this covers your additions 1 and 2)
1. Sign in at cloud.mongodb.com and open the project with the cluster from 1a.
2. **Find the live database name:** Database → Browse Collections. The live database is the one with the `users`, `purchases` and `behavioral_events` collections. Note its name; it is called `<live-db>` below.
3. **Create the live user:** Security → Database Access → **Add New Database User**.
   - Authentication: Password. Username: `nivesh-live`.
   - Click **Autogenerate Secure Password**, then **Copy**. Keep it in the clipboard only until step 5.
   - Database User Privileges → **Add Specific Privilege** → role `readWrite`, database `<live-db>`, collection left empty.
   - Click **Add User**.
4. **Build the new connection string:** Database → **Connect** → Drivers. Copy the string; it looks like `mongodb+srv://<username>:<db_password>@<cluster>.xxxxx.mongodb.net/?retryWrites=true&w=majority...`.
   - Replace `<username>` with `nivesh-live` and `<db_password>` with the copied password.
   - Put the database name right after `.net/`, so it reads `.net/<live-db>?retryWrites=...`.
5. **Update it everywhere it's used:** DigitalOcean → your app → Settings.
   - **web** component → Environment Variables → `MONGO_URL` → Edit → paste → keep **Encrypt** ticked → Save.
   - Do the same on the **ai** component.
   - DigitalOcean redeploys. Wait for "Deployed", then log in to the live site and open Portfolio to confirm your data is there.
   - Re-run the command from 1a: it should now print `nivesh-live`.
6. **Revoke the old user:** Database Access → `dhrumil` → **Delete**. Also delete any other old user you don't recognise.
7. **Demo user (used in Part 2):** add `nivesh-demo` the same way, with `readWrite` on a new database named `niveshpath_demo`.
   - Typing the name is enough; Atlas creates the database on first write.
   - Save the password in AWS Secrets Manager in Part 2, not anywhere else.
8. **No jobs user** (decided in review, Q1). The nightly job (PR F) will talk only to the web service's token-protected internal API: list the stocks people hold, save the daily prices, run the concentration check. So AWS holds no database passwords at all, only the internal token and the Finnhub key.
9. Network Access stays as it is for now. Part 2 changes it.

**1c. Finnhub:** sign in at finnhub.io → Dashboard → API key.
- Generate a new key, or contact Finnhub support to revoke the old one if your plan has no regenerate option.
- Put the new key in DigitalOcean → **web** → `FINNHUB_API_KEY` (Encrypt on) → Save.

**1d. Stripe:** dashboard.stripe.com → Developers → API keys → the Secret key row → **⋯ → Roll key** (expire now).
- The app no longer uses Stripe, so there's nothing to update.
- If that Stripe account isn't yours, tell its owner.

### Step 2 · Create the Postgres database (Neon)
1. Go to neon.tech → **Sign in with GitHub** → **New project**.
   - Name: `nivesh-path`. Postgres version: 16. Region: **AWS US East (N. Virginia)** (closest to DigitalOcean NYC).
2. On the project dashboard click **Connect**. Database `neondb`, role `neondb_owner`.
   - **Connection pooling ON:** copy the string (its host contains `-pooler`). Add `&pgbouncer=true` at the very end. This is your **pooled URL**.
   - **Connection pooling OFF:** copy the string. This is your **direct URL**.
3. Don't save them anywhere else. You paste them in Step 4.

### Step 3 · `AI_INTERNAL_TOKEN` on both components (if not already set)
1. DigitalOcean → your app → **Console** tab → choose **web** → run:
   ```
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. Copy the output to **web** → Environment Variables → `AI_INTERNAL_TOKEN` (Encrypt on), and the **same value** to **ai** → `AI_INTERNAL_TOKEN`. Save.
3. Without it, the new `/internal` trade API doesn't exist, and the AI service keeps reading MongoDB directly. That's safe, but it won't work after the Postgres cutover.

### Step 4 · Merge, then add the migration job (in this order)
1. **Merge PR A** (say "merge" to me). DigitalOcean deploys it automatically. The site behaves exactly as before.
2. **Add the pre-deploy job and the new variables:** DigitalOcean → your app → **Settings → App Spec → Edit**. Changing `.do/app.yaml` in the repo does not do this for you.
   - Do it only after the merge has deployed. Saving the spec starts a deploy, and the job needs PR A's code.
   - Make the three changes below, putting your two Neon URLs where it says. Type `SECRET` makes DigitalOcean encrypt them.

   (a) Under the `web` service's `envs:` add:
   ```yaml
         - key: LEDGER_BACKEND
           value: mongo
         - key: DATABASE_URL
           type: SECRET
           value: <pooled URL from Step 2>
   ```
   (b) Under the `ai` service's `envs:` add:
   ```yaml
         - key: WEB_INTERNAL_URL
           value: ${web.PRIVATE_URL}
   ```
   (c) At the top level (same indentation as `services:`), add:
   ```yaml
   jobs:
     - name: migrate
       kind: PRE_DEPLOY
       github:
         repo: sumitparmar19/Nivesh-Path
         branch: main
         deploy_on_push: true
       dockerfile_path: Dockerfile
       instance_count: 1
       instance_size_slug: apps-s-1vcpu-0.5gb
       run_command: npx --no-install prisma migrate deploy
       envs:
         - key: DATABASE_URL
           type: SECRET
           value: <pooled URL from Step 2>
         - key: DIRECT_URL
           type: SECRET
           value: <direct URL from Step 2>
   ```
   - Click **Save**. If it says the spec is invalid, the usual cause is indentation (spaces, not tabs). The full reference file is `.do/app.yaml` in the repo.
3. **Check the deploy:** Activity → the new deployment → **migrate** job logs. It should end with `All migrations have been successfully applied.`
   - If the job fails, the deploy stops and the old version keeps running. Send me the log lines (they contain no secrets).

### Step 5 · Live checks after the deploy
1. Console → **web** → `node scripts/db-check.js`. Expected:
   `{"ok":true,...,"migrations":["20261011225621_ledger_init"],"accounts":0,"trades":0}`
   - Zero accounts and trades is correct, because the cutover is PR B.
   - This line has no secrets; send it to me.
2. Open **What's new** (`/whats-new`).
   - The first entry is "Orders that can't go through twice".
   - The status panel shows the AI memory rebuild as **ok** with your user count. That proves the AI service now reads trades through the web service's `/internal` API.
3. Buy 1 share of anything. It goes through, the cash updates, and the Behavioral Mirror works as before.
4. **Retry check (optional):** on a slow connection, press Buy twice quickly. Transactions shows one trade.
5. Then I start PR B: the copy script and the cutover runbook. Your next live step there is the `--dry-run`.

---

## 2. What changed

**Ledger (Node)**
- **Store interface:** `src/lib/ledgerStore.{mongo,pg}.js`, chosen by `LEDGER_BACKEND` in `src/lib/ledgerStore.js`, default `mongo`.
  - Mongo store: today's logic moved here unchanged, plus idempotency.
  - Postgres store: Prisma.
- `ledger.js` now only validates and prices orders. It adds whole shares only (D1, max 1,000,000) and the 503 maintenance switch.
- **Every reader of trades/cash now goes through the store:**
  - routes: trade, history, holdings, summary, reset, account delete, Advisor holdings and memory count, pattern scores, the card time/size lookup, and `/api/me` cash;
  - the Behavior detector's "checked" mark;
  - the start-up clean-up.
- **Postgres** (`prisma/schema.prisma`, migration `20261011225621_ledger_init`):
  - Tables: `accounts` (cash `NUMERIC(14,2)`) and `trades`. Trade ids are 24-hex ObjectId strings, so links from MongoDB stay valid. Quantity is `INTEGER`; price is `NUMERIC(14,4)`.
  - Rules: foreign key with cascade, and `UNIQUE(user_id, idempotency_key)`.
  - CHECKs: cash ≥ 0, quantity/price/total > 0, side ∈ {buy, sell}, ObjectId format.
  - Each order is one transaction that starts with `SELECT … FOR UPDATE` on the account row.
  - A user's first Postgres account opens with their MongoDB balance.
  - Deleting an account removes the Postgres rows (cascade) and the old MongoDB copy.
- **Idempotency-Key** header:
  - Sent by the React trade panel and the legacy `trade.js`.
  - The same key is reused only while the *same* order is retried after an unclear failure (network error, 5xx); a 4xx or a success starts a new key.
  - A replay answers `200 {replayed: true}` with the original trade, with no second charge, no detection and no AI ingest.
  - MongoDB gets a matching partial unique index.
- **`LEDGER_MAINTENANCE=1`:** trades, reset and account delete answer 503 "Trading is paused for a few minutes…"; reads keep working.
- **Server start:**
  - refuses an unknown `LEDGER_BACKEND`, or `postgres` without `DATABASE_URL`;
  - shuts down gracefully on SIGTERM (closes the Prisma and Mongo pools).
- **`/internal/trades/users`, `/internal/trades?userId=`** (`src/routes/internal.js`):
  - only exist when `AI_INTERNAL_TOKEN` is set, and need it in `X-Internal-Token` (constant-time compare);
  - every failure is the same JSON 404;
  - read-only and rate-limited.

**AI service**
- `services/web_trades.py` `HttpTradeStore` reads trades from those endpoints.
- `get_trade_store()` uses it when `WEB_INTERNAL_URL` + the token are set, else MongoDB as before.
- The boot rebuild waits for the web service to start (retries 2/4/8/16/30 s). A 404 (token mismatch) fails fast with a clear log line.
- `httpx` is now a pinned runtime dependency.

**Frontend:** the Idempotency-Key in `TradePanel.tsx` and `api.ts`, `replayed` added to `TradeResult`, and the What's new entry plus a roadmap line.

**Ops / CI**
- **CI backend job:** a Postgres 16 service, `prisma migrate deploy`, and a drift check (`prisma migrate diff --exit-code`: schema and migrations must agree). The Postgres suite must run (`REQUIRE_PG_TESTS=1`).
- **New `secret-scan` job:** gitleaks 8.30.1, download checked against its SHA-256, full history (`fetch-depth: 0`).
  - Config `.gitleaks.toml` adds a MongoDB-URL rule (the defaults have none) and allows documentation placeholders.
  - `.gitleaksignore` lists only the 5 findings from the first commit (Step 1). Anything new fails the build.
  - I checked that a planted new MongoDB URL is caught.
- **e2e** now runs twice: on the Mongo ledger and on the Postgres ledger, with the AI service reading through `/internal`.
- **Docker job:** builds the image, then runs `prisma migrate deploy` + `scripts/db-check.js` inside it and boots it with `LEDGER_BACKEND=postgres` (Prisma on Alpine/musl, as the `node` user).
- **`Dockerfile`:** copies `prisma/` before `npm ci`, whose postinstall runs `prisma generate`.
- **`docker-compose.yml`:** a Postgres service; the backend migrates on start.
- **`.do/app.yaml`:** the `migrate` PRE_DEPLOY job, `LEDGER_BACKEND`, `WEB_INTERNAL_URL`.
- Also updated: `.env.example`, `CLAUDE.md`, the plan notes, and the MIT `LICENSE` (+ `package.json` license).

**Tests (before → after)**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 132 | 154 | 8 in `app.test.js` (idempotency, whole shares, maintenance, `/internal` auth and shape, unknown backend); 14 in `ledger.pg.test.js` against real Postgres |
| pytest | 39 | 46 | 7 in `test_web_trades.py` (token header, no request for non-ids, boot retry, wrong token fails fast, gives up after retries, one-user rebuild, source selection) |
| Vitest | 106 | 108 | 2 (key reused after a network error, new after success, 4xx or a different order) |
| Playwright | 2 | 2 × 2 ledgers | same 2 browser tests, now on Mongo and Postgres |
| **Total** | **279** | **310** | |

- **No existing test was edited.** Existing tests that touch ledger internals pass unchanged through the Mongo store.
- The 14 Postgres tests passed 5 runs in a row locally (Postgres 16.14).

**What the Postgres suite proves:**
- the database refuses negative cash, zero/negative quantity/price/total, an unknown side, a non-ObjectId id, and an orphan trade;
- **20 parallel $10,000 buys split across two separate app instances (two connection pools) → exactly 10 fill, 10 get "Insufficient funds", cash ends at $0.00**;
- 10 parallel 1-share sells with 5 owned → exactly 5 fill;
- a retried key → one trade, 200 `replayed`;
- 5 copies of one order at once across two instances → one trade;
- keys are per user;
- 10 × $10.01 leaves exactly `99899.90` (a float sum gives 99899.89999…);
- a first trade opens the account from the MongoDB balance; unknown users get 401;
- history, holdings and `/internal` read Postgres;
- the Mirror's checked marks are stored in Postgres;
- reset and delete remove the rows;
- maintenance answers 503 while reads still work.

**Run locally (by me)**
- The Playwright smoke test on the Postgres ledger, with the AI service reading through `/internal`: both pass. 2 trades landed in Postgres, both marked checked by the Mirror.
- After an AI service restart, the rebuild read 2 users / 2 trades through `/internal`.
- The production image, built locally: migrations and one query ran inside it as `node`, and it booted on Postgres. SIGTERM exits cleanly (code 0).

## 3. Bugs planted on purpose
1. **Removed `FOR UPDATE`** from the account lock. Two Postgres tests failed:
   - **sells:** 10 of 10 parallel sells filled with only 5 shares owned, a real oversell that no database rule catches;
   - **buys:** 10 filled, and the other 10 crashed with **500** when the `cash >= 0` CHECK fired. The database rule protected the money, but users would see "Internal server error" instead of "Insufficient funds".

   So the lock and the CHECK each catch something the other doesn't. Restored; all pass.
2. **Disabled the idempotency replay** in the Mongo store. The Jest idempotency test failed (`expected 200, received 201`: the retry was charged again). Restored.

## 4. Real numbers from this package
- No performance numbers yet. Load tests (k6) and latency come in PR C+D, with the output files saved in the repo.
- The measured facts here come from the tests, all in `tests/ledger.pg.test.js` and run in CI on every push:
  - 20 parallel orders → 10 filled, cash $0.00;
  - 10 parallel sells of 5 shares → 5 filled;
  - 5 duplicate submissions → 1 trade.

## 5. Limits, said plainly
- **I can't reach the live site, Neon or DigitalOcean.** Steps 4–5 are the live verification.
- **The Mongo store's lock is still per process** (one web instance today). The Postgres store's row lock works across instances; that's one reason for the move.
- **Reusing a key for a different order** (other ticker, side or share count) is refused with 422 "This order key was already used for a different order." (added in PR B, after review). The browser only reuses a key for the identical order. Keys never expire (fine at this size).
- **The AI rebuild makes one request per user.** Fine for a small site; I'll paginate if it grows.
- **`/api/me` overlays the Postgres cash, but login/register/profile-update responses still carry the MongoDB `cashBalance`.** No page shows that field (cash on screen always comes from `/api/portfolio/*`). It goes away in the D-cleanup PR.
- **After the cutover, "Start over" resets Postgres only.** The pre-cutover MongoDB trades stay as the rollback copy. Account deletion removes both.
- **The `migrate` job builds the same image again**, so each deploy has a second build and takes longer. I can't measure how much from here.
- **Neon's free plan sleeps after 5 idle minutes.** The first Postgres query afterwards is slower. It doesn't matter until the cutover, and it's noted for the PR C alert thresholds.
- **The leaked credentials stay in git history.** Rewriting public history doesn't un-leak them (clones, forks, caches), so rotation (Step 1) is the fix. The scan blocks any new leak.
- MongoDB gets the new `(userId, idempotencyKey)` partial unique index from Mongoose at start-up. It only covers new trades, so it can't conflict with old ones.

## 6. Resume bullets (measured only)
- Moved a paper-trading app's money ledger toward PostgreSQL with Prisma Migrate: `NUMERIC` money, database CHECK constraints and row-level locking (`SELECT … FOR UPDATE`). In CI against real Postgres, 20 concurrent orders across two app instances never overspent: exactly 10 filled and cash ended at $0.00.
- Added idempotent order submission (Idempotency-Key, unique per user): 5 simultaneous duplicate submissions produce exactly 1 trade, verified in CI. A zero-downtime switch (`LEDGER_BACKEND`, maintenance mode) supports the cutover and rollback.
- Added full-history secret scanning (gitleaks, checksum-pinned) to CI. It found live database, market-data and payment credentials in an early commit; they were rotated and new leaks now fail the build.

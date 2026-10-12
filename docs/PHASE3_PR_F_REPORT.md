# Phase 3 · PR F report: the nightly job (daily closes, overconcentration for everyone, rule v3)

**Status:**
- **Built and tested** locally and in CI.
- **On the live site:** the app part goes live when this PR is merged. The detector then starts using saved closes as soon as six exist for a stock; until then nothing changes.
- **The AWS part runs only after your steps below** (the bootstrap from PR E must be done first).
- **Planning-chat decisions this follows:**
  - Q1, PR B review: the job goes through token-only `/internal` endpoints on web, so AWS holds no database credentials.
  - Q3, PR E review: same deploy role and `aws-demo` environment.

---

## 1. Your steps, in order (all in a browser)

Never paste a token into any chat.

1. **Merge this PR** (say "merge"). DigitalOcean deploys it, and the `migrate` pre-deploy job creates the `price_snapshots` table on Neon.
   - The migrate job log ends with `All migrations have been successfully applied.`
   - Optional: Console → web → `node scripts/db-check.js` lists `…_price_snapshots` among the migrations.
2. **Prerequisite:** the AWS bootstrap is done (`docs/AWS.md` §4.1 steps B1–B4). The nightly job needs only that. It does **not** need the demo stack.
3. **One token in three places.** DigitalOcean never shows an encrypted value again, so make a new one:
   - AWS CloudShell: `openssl rand -hex 32` → copy it;
   - DigitalOcean → web → `AI_INTERNAL_TOKEN` → paste → Save;
   - DigitalOcean → ai → `AI_INTERNAL_TOKEN` → the **same** value → Save;
   - AWS → Secrets Manager → `nivesh-path/jobs` → Retrieve secret value → **Set secret value** → one key, `AI_INTERNAL_TOKEN` → Save.

   `FINNHUB_API_KEY` is **not** needed there; web fetches the quotes itself.
4. **Create the job:** GitHub → Actions → **AWS jobs: nightly job** → Run workflow → action `apply` → **Approve**. The summary shows the schedule (`cron(30 16 ? * MON-FRI *)`, America/New_York).
5. **Run it once now, after 4:00 pm New York:** the same workflow → action `run-now` → Approve. The summary shows:
   - the held tickers;
   - closes saved / skipped / failed;
   - the concentration check counts.

   Before 4 pm every close is "skipped" on purpose; the job never saves an intraday price as a close.
6. **Send me** the run link. On the 6th weekday after that, rule v3 starts using the saved closes for your stocks: new pattern cards say "over 5 trading days (from the daily closes this site saves)".
7. **To stop it:** action `destroy` + type `destroy`. The saved closes stay in Neon.

**If something fails:** the email names the step and the error.
- `TokenRejected`: the token in Secrets Manager doesn't match web's. Redo step 3.
- `WebUnavailable` after retries: the live site was down. The next run catches up.

## 2. What changed

**Database (Prisma migration `…_price_snapshots`):**
- table `price_snapshots`: `symbol`, `trading_date` (DATE), `close` NUMERIC(14,4), `source`, `captured_at`;
- **primary key (symbol, trading_date)**, so a re-run or a market holiday never adds a second row for the same day;
- hand-added CHECKs: close > 0, symbol is a ticker (`^[A-Z.]{1,10}$`), source is `finnhub`.

**Web (all switched on only with `AI_INTERNAL_TOKEN`; 404 otherwise):**
- `GET /internal/jobs/held-tickers`: tickers with net shares > 0 across all users (`ledger.heldSymbols()`).
- `POST /internal/jobs/snapshots/:symbol`:
  - web fetches the quote (its own Finnhub key and cache);
  - `closeFromQuote` decides which New York trading day it closes and **refuses while the market is open**;
  - then it upserts the row.
  - Errors: 400 bad ticker, 502 quote unavailable (the job retries), 503 without the Postgres ledger.
- `POST /internal/jobs/concentration-check`: `detector.checkAllUsers()`, the concentration rule for every user, with the same no-duplicate / re-warn logic as after a trade. One user's failure doesn't stop the rest.
- These are the first writing routes under `/internal`. They were reviewed and approved in the PR B review (Q1), and are listed in `CLAUDE.md`.

**Behavioral Mirror rule v3** (`behaviorRules.fiveDayFromSnapshots`, `RULE_VERSION = 3`):
- **Needs 6 closes** (5 trading days of change).
- The newest close must be ≤ 5 days old (a weekend plus a holiday is 4).
- The 6 must span ≤ 8 calendar days, so a missed run never passes off a longer window as "5 days".
- Otherwise it falls back to Finnhub's 5-day figure, exactly like v2. **The thresholds are unchanged**, so the start-up clean-up only bumps v2 events to v3.
- The detector reads snapshots alongside Finnhub. A snapshot problem means falling back, never a failed trade.
- If Finnhub is down but six closes exist, the trade is still checked.
- Events carry `facts.fiveDaySource` (`snapshots` / `finnhub`).

**UI:**
- Pattern cards say "…over 5 trading days (from the daily closes this site saves)" when the move came from snapshots.
- "How patterns are detected" explains rule v3.
- What's new entry: "Daily closing prices and a nightly check".

**AWS (`infra/jobs`):**
- **EventBridge Scheduler:** weekdays at 16:30 America/New_York, 2 retries.
- **Step Functions (standard, 30-minute limit):**
  - list tickers;
  - **Map**: 2 at a time, a 2 s pause after each, retry ×4 with backoff + jitter on `WebUnavailable` / Lambda errors; one stock's failure is recorded and the rest continue;
  - the concentration check;
  - if any close is missing, an email listing them and the run ends failed; any other failure, an email with the error and cause.
- **CloudWatch alarm:** a timed-out run emails too.
- **The Lambda** (`infra/jobs/lambda/index.js`):
  - Node 22 on arm64, 128 MB, no dependencies;
  - reads `AI_INTERNAL_TOKEN` from `nivesh-path/jobs` once per container;
  - error names drive the retries: `WebUnavailable` is retried; `TokenRejected` and `BadInput` are not.
- **IAM:** three roles (Lambda, workflow, scheduler), each with only its own permissions **and the workload boundary**.
- **Logs:** 14 days, no execution data logged.

**Workflows:**
- New `aws-jobs.yml`: `apply` / `run-now` (starts one run, waits, summarises the output) / `destroy`. Manual, `main` only, `aws-demo` environment.
- `infra.yml` now also validates `infra/jobs`, and runs when the jobs workflow changes.

**Docs:** `docs/AWS.md` §8 (diagram, the three routes, runbook, cost), `docs/PHASE3_LIVE_STATUS.md` (step 9), `CLAUDE.md`, plan notes.

**Tests (before → after)**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 187 | **220** | `nightlyJob.test.js` (19): v3 boundaries (6 vs 5 closes, age 5 vs 6 days, span 8 vs 9 days, bad rows, newest 6 used), which day a quote closes (after 4 pm, during the session, weekend, New York not UTC, missing data), the detector's source and fallbacks, the nightly all-users check, `heldSymbols`. `jobsLambda.test.js` (5): routes + token, read once, error names, bad input never calls web, a failed token read is retried. `app.test.js` (+6): the three routes (token-only, held tickers, save once then update, skipped during the session, 400/502/503, concentration counts). `priceSnapshots.pg.test.js` (3, real Postgres): CHECKs, upsert keeps one row, `recent()` feeds rule v3 |
| pytest | 54 | 54 | |
| Vitest | 112 | **114** | card wording for snapshot vs Finnhub moves; the Mirror explains rule v3 |

- **Two existing assertions changed:** from the literal rule version `2` to `rules.RULE_VERSION`, because the version is now 3. No other existing test was edited.

**Infrastructure checks:**
- `terraform validate` passes for all three stacks.
- **Checkov:** 349 passed / 0 failed / 58 skipped across all stacks. Each skip has its reason in the code.
- actionlint is clean.

## 3. Bugs planted on purpose

| Planted bug | Caught by |
|---|---|
| Rule v3 accepts **5** closes | 2 boundary tests (5 closes must fall back) |
| The intraday price check removed (a 1 pm price saved as the "close") | 2 tests (the pure helper and the route) |
| The Lambda maps a 404 to a retryable error (a wrong token retried forever, and no clear email) | the `TokenRejected` test |
| The detector ignores the saved closes | 2 detector tests |

All restored; all pass.

## 4. Real numbers

| Number | Source |
|---|---|
| Cost: about **$0 a month**. About 27 Step Functions transitions a run, about 600 a month (4,000 free); about 260 Lambda calls (fractions of a cent); Scheduler, logs, 1 alarm and email inside free tiers. The token secret ($0.40/month) is already counted in PR E | `docs/AWS.md` §8.2, from the AWS Price List (us-east-1, fetched 2026-10-12): Step Functions $0.000025 per transition; Lambda arm64 $0.0000002 per request, $0.0000133334 per GB-second |
| Live run (tickers saved, users checked) | **pending your step 5** |

## 5. Limits, said plainly
- **Not run on AWS yet**, and I can't reach AWS from here. The state machine's JSONPath filter (`$.snapshots[?(@.failed == true)].symbol`) and the intrinsic functions are checked only by Terraform's JSON encoding. AWS validates the definition when you apply, and an error there names the state.
- **Rule v3 needs 6 weekday runs per stock before it changes anything.** A stock bought today gets its first saved close tonight.
- **The closes come from Finnhub's quote after 4 pm,** which is the regular-session last price. It's not an official exchange closing print, and on rare days it can differ by cents.
- **A token change needs three places updated together** (web, ai, the jobs secret). DigitalOcean hides saved values, so it can't be read back.
- **The nightly concentration check uses prices from web's 60-second quote cache** at that moment. It's the same data a user would see.
- **The Lambda runs on arm64.** It's plain JavaScript, so there's no build difference. The planning chat's "no ARM for now" was about the Fargate images.

## 6. Resume bullets (measured numbers only; add the live run's after step 5)
- Built a serverless nightly pipeline on AWS: EventBridge Scheduler, then a Step Functions Map with bounded concurrency, retries with backoff and per-item failure capture, then Lambda. It snapshots daily closes for every held stock and re-checks portfolio concentration for all users. It costs about $0 a month and holds no database credentials in AWS: the job calls a token-protected internal API.
- Added a versioned rule change (v3) to a behavioral-finance detector: the 5-day price move now comes from the app's own stored closes, with boundary-tested freshness and window checks and a fallback to the market-data provider. Each flag records which data source it used.

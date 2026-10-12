# Phase 3 · PR B report: the ledger move (MongoDB → Postgres)

**Status:** merged, and **the live cutover is done** (Oct 12, 2026). The live site's money is now in PostgreSQL (Neon), and **A1 live acceptance is met**. The evidence is in §0.

---

## 0. Live cutover result (Oct 12, 2026)

All outputs below are as reported from the DigitalOcean Console (user ids and amounts only).

**1. Dry run** (`--dry-run`):
```
Users: 1 · trades to copy: 6 · legacy rows without a user: 1 · trades of deleted users: 0 (0 users)
user 6ac1c0e915d46720fa877935: cash 70283.89, 6 trades
Rounding changes (0)
No blocking problems.
```

**2. Pause:** `LEDGER_MAINTENANCE=1` on web.

**3. Copy** (`--migrate`):
```
user 6ac1c0e915d46720fa877935: created, 6 copied, 0 already there
Copied. Now run --verify.
```

**4. Verify** (`--verify`):
```
match · cash 70283.89 · 6 trade(s) · INTC 89, META 7, MSFT 7, QQQ 4, SPY 11
All users match (1). Safe to set LEDGER_BACKEND=postgres.
```

**5. Switch:** `LEDGER_BACKEND=postgres` set and `LEDGER_MAINTENANCE` deleted, in one save, between about **18:26 and 18:43 UTC**. The exact time is in DigitalOcean → Activity.

**6. Checks after the switch:**
- The runtime log shows `Ledger: postgres`.
- What's new shows **"Money ledger: PostgreSQL (Neon)"** and "All systems go".
- A new trade works (a DIA buy).
- **Behavioral Mirror:**
  - impulse control 100 ("8 of your 8 checked trades");
  - diversification 83 (largest position DIA, 16.59% of the account);
  - 0 patterns.
- `db-check`:
  ```
  {"ok":true,"server":"PostgreSQL 18.6","migrations":["20261011225621_ledger_init"],"accounts":1,"trades":8}
  ```
  That's the 6 copied trades plus 2 new ones.

**What the outputs show:**
- 0 rounding changes;
- 0 blocking problems;
- cash and every holding matched to the cent;
- the one legacy row without a user was left behind, as designed (nobody could see it).


## 1. Your steps, in order (all in a browser)

**Before you start:**
- **PR A's Steps 1–5 are done:** credentials rotated, Neon created, token set, the `migrate` job added, `db-check` OK.
- **PR B is merged and deployed.** Say "merge"; DigitalOcean deploys it, and the `migrate` job runs and finds nothing new.

The full runbook with every command is `docs/LEDGER_CUTOVER.md`. In short:

1. **Dry run (changes nothing):** DigitalOcean → app → **Console** → **web** → `node scripts/migrate-ledger.js --dry-run`.
   - Send me the whole output. It contains user ids and amounts only, no emails or secrets.
   - If it says `BLOCKING problems`, stop here. I'll fix the data handling before you continue. The likely case is a fractional share count from the old API.
2. **Pause trading:** web → Environment Variables → add `LEDGER_MAINTENANCE` = `1` → Save → wait for "Deployed".
3. **Copy and check:** open a new Console session on web.
   - Run `node scripts/migrate-ledger.js --migrate`. It must end with `Copied. Now run --verify.`
   - Run `node scripts/migrate-ledger.js --verify`. It must end with `All users match (N)`.
   - Copy the verify output; it gets attached to the PR as the proof.
   - If you see `MISMATCH` or `conflict`, delete `LEDGER_MAINTENANCE` (trading reopens on MongoDB with nothing lost) and send me the output.
4. **Switch:** web → Environment Variables → `LEDGER_BACKEND` = `postgres`, **delete** `LEDGER_MAINTENANCE` → Save once.
5. **Write down the switch time** (UTC, from Activity). A rollback needs it.
6. **Check on the live site:**
   - What's new → status panel shows **Money ledger: PostgreSQL (Neon)**;
   - Portfolio shows the same cash, holdings and history as before;
   - buy 1 share: it fills, and the Behavioral Mirror works;
   - the AI memory rebuild shows ok;
   - Console `node scripts/db-check.js` shows your account and trade counts.
7. **Rollback, only if needed:** set `LEDGER_BACKEND` = `mongo` → Save.
   - Then run `node scripts/migrate-ledger.js --export-since <switch time>` and send me the list. Those are the trades MongoDB doesn't have.

## 2. What changed
- **`src/lib/ledgerMigration.js`:** the move as plain functions.
  - `plan` (pure): per user, what's copied, every rounding change, every blocking problem.
  - `apply`: per user, one transaction; it locks an existing account.
  - `verify`, and `tradesSince`.
- **`scripts/migrate-ledger.js`:** the command `--dry-run | --migrate | --verify | --export-since <ISO>` (+ `--json`). It reads MongoDB only, and exits 1 on any blocking problem, conflict or mismatch.
- **Rounding:** cash and totals are rounded half-up to cents; prices to 4 places.
  - Every change is listed.
  - A stored total that differs from price × quantity is kept, because it is what actually moved the cash, and it is reported.
- **Same trade ids:** a trade keeps its MongoDB id, so Behavioral Mirror events, analyses and AI memory still point at it.
- **Users without a `cashBalance`** (signed up before the ledger) get $100,000, exactly as the live site treats them today.
- **Re-run safety:**
  - Rows are keyed by MongoDB id, so a re-run never duplicates anything.
  - A re-run copies trades and checked marks added in MongoDB since the last run, and refreshes cash.
  - It **refuses a user who already has Postgres-only trades** (a conflict; their cash is left untouched).
  - It **refuses to run while `LEDGER_BACKEND=postgres`**, and refuses to `--migrate` unless `LEDGER_MAINTENANCE=1` (`--force` overrides both, for tests).
- **Verify, per user:**
  - cash to the cent;
  - the exact set of trade ids;
  - holdings per stock: share count exact, cost basis within $0.01, computed from the raw MongoDB rows exactly as the live site does today;
  - the number of checked trades.
- **Not copied, and counted in the dry run:**
  - rows from before per-user accounts (no user, invisible to everyone);
  - trades of deleted accounts.
- **`/api/status` now includes `ledger: {backend, tradingPaused}`**, with no database call (Neon would never sleep under polling).
  - What's new shows it as **Money ledger**: "MongoDB" / "PostgreSQL (Neon)", and "trading paused for an upgrade" (amber) during the copy.
  - There is a new What's new entry.
- **Docs and image:** `docs/LEDGER_CUTOVER.md` (the runbook), and the Dockerfile ships the script.

**Tests (after PR A → after PR B)**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 154 | 170 | 13 in `ledgerMigration.pg.test.js` (5 pure, 8 against Postgres); 1 status test; 2 for the 422 below (one per store) |
| pytest | 46 | 46 | |
| Vitest | 108 | 109 | ledger row + paused warning on What's new |
| Playwright | 2 × 2 ledgers | same | |

The Postgres tests cover:
- copy + verify (float leftovers like `187.43999999999998` and `99899.89999999999` land as `187.4400` and `99899.90` and still verify);
- a company-name row (`Tesla` → `TSLA`);
- a pre-ledger user;
- a legacy row and a deleted user's trade, neither copied;
- running twice;
- a re-run picking up new trades and checked marks;
- verify catching a **one-cent** difference and a missing trade, and naming the user;
- the post-cutover conflict;
- blocking problems writing nothing;
- `--export-since`;
- the portfolio summary computed from MongoDB vs from Postgres being **identical**.

**Run by me end to end** with a real MongoDB 7 and Postgres 16: dry run → `--migrate` refused without maintenance → migrate → verify "All users match (2)" → re-run (0 copied, still matching) → refused under `LEDGER_BACKEND=postgres` → export.

## 2b. Changes after the planning chat's review
1. **A reused Idempotency-Key with a different order now gets 422** "This order key was already used for a different order."
   - "Different" means another ticker, side or share count. The price is re-quoted live, so it isn't compared.
   - It's checked once in `ledger.js`, so both stores behave the same.
   - The identical order still replays (200).
   - Tests: `app.test.js` (MongoDB store) and `ledger.pg.test.js` (Postgres store). Both confirm nothing was bought and the cash didn't change.
2. **A trade with no usable timestamp is no longer saved as 1 Jan 1970**, which would have moved it to the front when buys and sells are put in order for the average cost.
   - It gets the creation time built into its MongoDB id.
   - `--dry-run` lists it: "no timestamp (missing): using the time from its id, …".
   - Test in `ledgerMigration.pg.test.js`.
   - **Note:** today's live site sorts such a row first. If one exists between a buy and a sell, `--verify` may report a cost-basis difference for that stock. That's on purpose: the move stops, rather than quietly changing your average cost. Send me the output if it happens.
3. **Decisions recorded:**
   - Q1: the nightly job uses `/internal` only, there is no `nivesh-jobs` Atlas user, and AWS holds no database credentials.
   - Q2: no copy-back.
   - Q4: remove the MongoDB ledger code about a week after the cutover.
   - Q5: start PR C+D.

Planted bugs for these:
- Turning the 422 check off failed both new tests (one per store).
- Putting the 1970 fallback back failed the timestamp test.

## 3. Bug planted on purpose
- I removed the post-cutover conflict check in `applyUser`. The conflict test failed: the user was reported `updated` instead of `conflict`, and their newer Postgres cash would have been overwritten with the older MongoDB balance.
- Restored; all pass.

## 4. Real numbers
- **Live cutover** (§0, from Sumit's Console output):
  - 1 account and 6 trades moved;
  - 0 rounding changes, 0 blocking problems;
  - verify "All users match (1)", with cash 70,283.89 equal to the cent;
  - afterwards Postgres held 1 account and 8 trades (6 copied + 2 new).

## 5. Limits, said plainly
- **The rollback loses Postgres-only trades from MongoDB's point of view.** `--export-since` lists them, but there is no automatic copy back; with one active user it's quicker to redo them by hand. Say if you want a `--copy-back` mode.
- **Trading is paused for the length of the copy.** At today's size that's seconds of script time plus two DigitalOcean deploys (the pause and the switch). I can't measure the deploy time from here.
- **Verify compares cost basis within one cent**, not exactly, because prices are rounded to 4 places. A position large enough to move more than a cent would show up as a mismatch, not pass silently.
- **"Start over" after the switch only resets Postgres** (as noted in PR A). The MongoDB copy stays as the backup.

## 6. Resume bullets (measured only)
- Migrated a live paper-trading ledger from MongoDB to PostgreSQL (Neon) with a repeat-safe copy tool (dry-run, verify, rollback export). It checked every account's cash and holdings to the cent before the switch: 0 rounding changes, 0 blocking problems, every account matched. New trades and the Behavioral Mirror worked on Postgres straight after.
- Built the move so a rerun never duplicates or overwrites newer data: keys are the original ids, and a per-user conflict check is proven by a test that fails when the check is removed.

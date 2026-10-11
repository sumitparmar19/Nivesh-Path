# Ledger cutover runbook: MongoDB → Postgres

Moves every user's cash and trades from MongoDB to Postgres (Neon) with about 5 minutes of paused trading. Everything happens in a browser, in DigitalOcean.

**Before you start:** PR A and PR B are merged and deployed, the `migrate` pre-deploy job has run (Step 4 of the PR A report), and `node scripts/db-check.js` in the web Console prints `"ok":true`.

## 0. Dry run (any time, changes nothing)
1. DigitalOcean → your app → **Console** → **web**, then run:
   ```
   node scripts/migrate-ledger.js --dry-run
   ```
2. Read the end of the output:
   - `No blocking problems.` means you can do the cutover.
   - `BLOCKING problems` means stop and send the output to Claude. Examples are a fractional share count from the old API or a broken row.
3. `Rounding changes` lists every value that changes when stored with fixed decimals (cash and totals to cents, prices to 4 places). Send that part to Claude too, so it goes into the PR B report.

The output shows user ids and amounts only, never emails, passwords or keys.

## 1. Pause trading (1 minute)
1. DigitalOcean → **web** → Settings → Environment Variables → **Add** `LEDGER_MAINTENANCE` = `1` → Save.
2. Wait for the deploy to finish (Activity shows "Deployed").
   - Buy, Sell, Start over and Delete account now answer "Trading is paused for a few minutes".
   - Pages and portfolios still load.

## 2. Copy and verify (1–2 minutes)
1. In a new Console session on **web** (it now has `LEDGER_MAINTENANCE=1`), run:
   ```
   node scripts/migrate-ledger.js --migrate
   ```
   It must end with `Copied. Now run --verify.`
2. Then run:
   ```
   node scripts/migrate-ledger.js --verify
   ```
   It must end with `All users match (N). Safe to set LEDGER_BACKEND=postgres.`
3. **Copy the whole verify output.** It gets attached to the PR as the proof, and it has no secrets.
4. **If either command says `MISMATCH` or `conflict`:**
   - don't switch;
   - remove `LEDGER_MAINTENANCE` to reopen trading on MongoDB (nothing was lost: MongoDB was only read);
   - send the output to Claude.

## 3. Switch (1 save)
1. In **web** → Environment Variables:
   - change `LEDGER_BACKEND` to `postgres`;
   - **delete** `LEDGER_MAINTENANCE`;
   - click Save once, so both changes go out in one deploy.
2. After "Deployed", check:
   - the server log (Runtime Logs) shows `Ledger: postgres`;
   - log in: Portfolio shows the same cash, holdings and history as before;
   - buy 1 share: it fills, cash drops, and the Behavioral Mirror note or page works;
   - What's new: the AI memory rebuild shows **ok**;
   - Console: `node scripts/db-check.js` now shows non-zero `accounts` and `trades`.
3. **Write down the time of the switch** (UTC, from the deploy's Activity entry). A rollback needs it.

## Rollback (if something is wrong after the switch)
1. **web** → set `LEDGER_BACKEND` back to `mongo` → Save. The site is back on MongoDB as it was at the cutover.
2. **Trades made on Postgres after the switch are not in MongoDB.** List them with:
   ```
   node scripts/migrate-ledger.js --export-since <switch time, e.g. 2026-10-20T14:00:00Z>
   ```
   Send the list to Claude. Those users' MongoDB cash and holdings don't include those trades.
3. To retry the cutover later, start again at step 1.
   - `--migrate` refuses users who already traded on Postgres (it reports a `conflict`), so newer Postgres balances are never overwritten by older MongoDB ones.
   - It also refuses to run at all while `LEDGER_BACKEND=postgres` (unless `--force`).

## What the script guarantees
- **MongoDB is never written.** It stays as the backup, and the D-cleanup PR leaves the data in place.
- **Re-running is safe:**
  - rows are keyed by the MongoDB ids, so nothing is duplicated;
  - a re-run copies trades added since the last run and refreshes cash and the Mirror's "checked" marks;
  - it never overwrites a user who already has Postgres-only trades.
- **Trade ids stay the same** (24-character MongoDB ids), so Behavioral Mirror events, analyses and AI memory keep pointing at the right trades.
- **Verify compares, per user:**
  - cash to the cent;
  - the exact set of trades;
  - holdings per stock: share count exact, cost basis within one cent;
  - the number of checked trades.

  Any difference fails the run (exit code 1).
- **Rows that can't be copied block `--migrate`** before anything is written:
  - fractional shares (decision D1);
  - non-positive price or quantity;
  - unknown side;
  - negative cash.
- **Not copied, and listed in the dry run:**
  - trades without a user, from before per-user accounts (nobody can see them);
  - trades of deleted accounts.

# The money ledger

Every account starts with $100,000 of virtual cash. Buys debit it, sells credit it, and holdings are derived from
the trades. The ledger is the one part of the app where a bug loses (paper) money, so the rules live in the
database, not only in code.

| Part | Where |
|---|---|
| Order validation and pricing (live quote, whole shares, buy/sell checks) | `src/lib/ledger.js` |
| Store selection (`LEDGER_BACKEND=postgres` in production, `mongo` as the rollback path) | `src/lib/ledgerStore.js` |
| PostgreSQL store (Prisma) | `src/lib/ledgerStore.pg.js`, `prisma/schema.prisma`, `prisma/migrations/` |
| MongoDB store (the original ledger, same interface) | `src/lib/ledgerStore.mongo.js` |
| MongoDB → PostgreSQL move | `src/lib/ledgerMigration.js`, `scripts/migrate-ledger.js`, [`LEDGER_CUTOVER.md`](LEDGER_CUTOVER.md) |
| Tests against a real PostgreSQL (CI starts one) | `tests/ledger.pg.test.js`, `tests/ledgerMigration.pg.test.js` |

## 1. Design

**One ledger, two stores.** Routes never touch trades or cash directly. Everything goes through `ledger.js`, which
validates and prices the order and then calls the store picked by `LEDGER_BACKEND`. Both stores implement the same
interface (trade, history, holdings, summary, reset, delete, checked marks, held tickers), so every reader of trade
data (portfolio, Advisor, Behavioral Mirror, account deletion, the AI service's `/internal` API) works on either.

**What lives where:**
- PostgreSQL (Neon in production): `accounts` (cash) and `trades`.
- MongoDB: users and auth, Behavioral Mirror events, AI memory, analyses, watchlists, messages. They hold no
  money, and keeping them in place halved the risk of the move.
- Holdings aren't stored. They're computed from trades, so there's no second copy to drift.

**Schema** (`prisma/schema.prisma`, migration `20261011225621_ledger_init`):
- `accounts`: `user_id` (the MongoDB user id), `cash NUMERIC(14,2)`, `total_deposited NUMERIC(14,2)`.
- `trades`: `id` (the same 24-hex id as the MongoDB trade it came from, so Behavioral Mirror events, analyses and AI
  memory keep pointing at the right trade), `symbol`, `side`, `quantity INTEGER`, `price NUMERIC(14,4)`,
  `total NUMERIC(14,2)`, `behavior_checked_at`, `idempotency_key`, `executed_at`.
- **Rules the database enforces** (hand-written in the migration SQL, because Prisma can't express CHECKs):
  `cash >= 0`, `quantity > 0`, `price > 0`, `total > 0`, `side IN ('buy','sell')`, ids are ObjectIds; a foreign key
  from trades to accounts with cascade; `UNIQUE (user_id, idempotency_key)`.
- **Money is never a float.** NUMERIC in the database, Prisma `Decimal` in code; it becomes a JS number only in the
  API response.
- **Whole shares only** (an INTEGER column, and the API refuses fractions before touching the database).

CI fails if `schema.prisma` and the migrations disagree.

## 2. Concurrency

Each order is **one database transaction** that first locks the user's account row:

```sql
SELECT ... FROM accounts WHERE user_id = $1 FOR UPDATE
```

Then it reads cash or the share count, checks the order, inserts the trade and updates cash. Two orders for the same
user queue on that lock, **even when they arrive at different web instances**. If the code's check were ever wrong,
the CHECK constraints would still refuse negative cash or quantities.

**Tests (real PostgreSQL, two app instances with separate connection pools):**

| Test | Result |
|---|---|
| 20 parallel $10,000 buys on a $100,000 account, split across two app instances | exactly 10 fill, 10 get "Insufficient funds", cash ends at **$0.00** |
| 10 parallel 1-share sells when 5 shares are owned | exactly 5 fill; the rest get "You own 0 TSLA shares" |
| 10 × $10.01 buys | cash is exactly `99899.9` (floating point would give `99899.89999999…`) |
| Negative cash written directly to the table | refused by the database |

Planted bug: with `FOR UPDATE` removed, the sell test filled **10 of 10** sells with only 5 shares owned, and the
buy test returned 500 errors instead of "Insufficient funds".

The MongoDB store, kept for rollback, uses an atomic `$inc` plus a per-user lock inside one process.

## 3. Idempotent orders

A dropped connection or a double click must not buy twice.
- Both trade UIs send an `Idempotency-Key` header (8–100 of `[A-Za-z0-9_-]`): a new random key per order, reused only
  while the *same* order is retried after an unclear failure.
- The same key again returns **200** with `replayed: true` and the original trade. Nothing is charged twice.
- The same key with a **different** order (ticker, side or share count) returns **422** "This order key was
  already used for a different order." The price is re-quoted live, so it isn't compared. This is checked once in
  `ledger.js`, so both stores behave the same.
- Keys are per user; a malformed key is a 400.

| Test | Result |
|---|---|
| The same order sent 5 times at once, across two app instances | **1 trade**, charged once |
| A retry with the same key | 200 `replayed`, same trade id, one charge |
| Same key, different order | 422, no trade, no charge |

Planted bug: with the replay turned off, the idempotency test failed with `expected 200, received 201` (charged
twice). On the live site, the double-click test in the live smoke test places exactly one trade
([`RESULTS.md`](RESULTS.md)).

## 4. Pausing trading: `LEDGER_MAINTENANCE=1`

Buy, Sell, "Start over" and account deletion answer **503** "Trading is paused for a few minutes". Pages and portfolio
reads keep working. `/api/status` reports `ledger: { backend, tradingPaused }` without a database call, and What's
new shows "Money ledger" with an amber note while paused. Used only during the move below.

## 5. The move from MongoDB to PostgreSQL

The ledger started in MongoDB (`User.cashBalance` plus the `purchases` collection). The move had three risks: losing
a trade made during the copy, a cash mismatch, and being unable to roll back. The plan was a short, announced pause
rather than dual writes: simpler to verify at this scale.

**The tool** (`scripts/migrate-ledger.js`, logic in `src/lib/ledgerMigration.js`):

| Command | Does |
|---|---|
| `--dry-run` (default) | Per user: what would be copied, every value that changes when stored with fixed decimals (cash and totals half-up to cents, prices to 4 places), every blocking problem. Changes nothing |
| `--migrate` | One transaction per user; keeps trade ids; normalises company names to tickers (`Tesla` → `TSLA`). Refuses unless `LEDGER_MAINTENANCE=1` |
| `--verify` | Per user: cash to the cent, the exact set of trade ids, holdings per stock (share count exact, cost basis within $0.01), the number of checked trades. Any difference exits 1 |
| `--export-since <time>` | After a rollback: the Postgres trades MongoDB doesn't have |

**Safety rails:**
- MongoDB is only ever read; it stays as the backup.
- Re-running is safe: rows are keyed by the MongoDB ids, and a re-run picks up trades added since.
- It refuses a user who already traded on Postgres (a conflict), so newer Postgres balances are never overwritten.
- It refuses to run while `LEDGER_BACKEND=postgres` (unless `--force`).
- Rows that can't be copied (fractional shares, non-positive price or quantity, unknown side, negative cash) block
  `--migrate` before anything is written.
- A trade with no usable timestamp gets its id's creation time, not 1970, and the dry run says so.
- Not copied, and counted in the dry run: rows from before per-user accounts (no user, invisible to everyone) and
  trades of deleted accounts.

**Tests** (`tests/ledgerMigration.pg.test.js`, real MongoDB-shaped rows and a real PostgreSQL): float leftovers such as
`187.43999999999998` land as `187.4400` and still verify; running twice duplicates nothing; verify catches a
one-cent difference and a missing trade and names the user; the post-cutover conflict leaves cash untouched;
blocking problems write nothing; the portfolio computed from MongoDB and from Postgres is identical.
Planted bug: with the conflict check removed, newer Postgres cash was overwritten.

### The live cutover (Oct 12, 2026)
Run from the DigitalOcean console, about 18:26–18:43 UTC, following [`LEDGER_CUTOVER.md`](LEDGER_CUTOVER.md):

| Step | Output |
|---|---|
| Dry run | `Users: 1 · trades to copy: 6 · legacy rows without a user: 1 · trades of deleted users: 0 (0 users)` · `Rounding changes (0)` · `No blocking problems.` |
| Pause | `LEDGER_MAINTENANCE=1` |
| Copy | `created, 6 copied, 0 already there` · `Copied. Now run --verify.` |
| Verify | `match · cash 70283.89 · 6 trade(s) · INTC 89, META 7, MSFT 7, QQQ 4, SPY 11` · `All users match (1). Safe to set LEDGER_BACKEND=postgres.` |
| Switch | `LEDGER_BACKEND=postgres` and `LEDGER_MAINTENANCE` removed in one save |
| After | Log `Ledger: postgres`; What's new "Money ledger: PostgreSQL (Neon)"; a new buy filled; `db-check`: `{"ok":true,"server":"PostgreSQL 18.6","migrations":["20261011225621_ledger_init"],"accounts":1,"trades":8}` (the 6 copied plus 2 new) |

The one legacy row without a user was left behind, as designed. The live site has run on the PostgreSQL ledger
since.

**Rollback** (not needed): set `LEDGER_BACKEND=mongo`. MongoDB is exactly as it was at the cutover; trades made on
Postgres afterwards are listed with `--export-since` and would have to be redone by hand.

## 6. Migrations in production
A DigitalOcean `PRE_DEPLOY` job runs `npx prisma migrate deploy` with the same image before each deploy. If it fails,
the deploy stops and the running version stays up (a migration in the run command would crash-loop the live
container instead). Migrations use Neon's direct URL (`DIRECT_URL`); the app uses the pooled one with
`pgbouncer=true`. The AWS demo stack runs the same migration as a one-off ECS task before rolling out
(`infra/scripts/deploy.sh`).

## 7. Limits
- After a rollback, Postgres-only trades must be redone by hand (there's no copy back to MongoDB).
- The MongoDB store's lock is per process, so it's only safe with one web instance. Production runs Postgres.
- Neon's free plan sleeps after 5 idle minutes; the first query afterwards is slower.

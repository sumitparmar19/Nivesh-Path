// Moves the money ledger (cash + trades) from MongoDB to Postgres - the Phase 3 cutover tool.
// Run it in the DigitalOcean Console of the web component (it already has MONGO_URL and DATABASE_URL):
//   node scripts/migrate-ledger.js --dry-run              what would be copied, rounding changes, blocking problems
//   node scripts/migrate-ledger.js --migrate              copy (repeat-safe; refuses while LEDGER_BACKEND=postgres)
//   node scripts/migrate-ledger.js --verify               cash + holdings must match to the cent; exit 1 otherwise
//   node scripts/migrate-ledger.js --export-since <ISO>   Postgres trades since a time (what a rollback would miss)
// Add --json for machine-readable output. MongoDB is only read. Output has user ids, never emails or secrets.
// Steps and timings: docs/LEDGER_CUTOVER.md.
const mongoose = require("mongoose");
const { PrismaClient } = require("@prisma/client");
const { config } = require("../src/config");
const migration = require("../src/lib/ledgerMigration");

const MODES = ["--dry-run", "--migrate", "--verify", "--export-since"];

function parseArgs(argv) {
  const mode = argv.find((a) => MODES.includes(a)) || "--dry-run";
  const opts = { mode, json: argv.includes("--json"), force: argv.includes("--force") };
  if (mode === "--export-since") {
    const raw = argv[argv.indexOf("--export-since") + 1];
    const since = new Date(raw);
    if (!raw || Number.isNaN(since.getTime())) throw new Error("--export-since needs a time, e.g. 2026-10-20T14:00:00Z");
    opts.since = since;
  }
  return opts;
}

async function loadMongo() {
  const db = mongoose.connection.db;
  const users = await db.collection("users").find({}, { projection: { cashBalance: 1, totalDeposited: 1 } }).toArray();
  const purchases = await db.collection("purchases").find({}).toArray();
  return { users, purchases };
}

function printPlan(p, log) {
  const trades = p.users.reduce((n, u) => n + u.trades.length, 0);
  const notes = p.users.flatMap((u) => u.notes.map((n) => `  user ${u.userId}: ${n}`));
  log(`Users: ${p.users.length} · trades to copy: ${trades} · legacy rows without a user: ${p.legacyTrades} · trades of deleted users: ${p.orphanTrades} (${p.orphanUsers} users)`);
  for (const u of p.users) log(`  user ${u.userId}: cash ${u.cash.toFixed(2)}, ${u.trades.length} trade(s)${u.problems.length ? `, ${u.problems.length} PROBLEM(S)` : ""}`);
  log(`Rounding changes (${notes.length}):`);
  notes.forEach((n) => log(n));
  if (p.blocking.length) {
    log(`BLOCKING problems (${p.blocking.length}) - --migrate refuses until they are resolved:`);
    p.blocking.forEach((b) => log(`  ${b}`));
  } else log("No blocking problems.");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const log = (s) => console.log(s);
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient();
  try {
    if (opts.mode === "--export-since") {
      const rows = await migration.tradesSince(prisma, opts.since);
      if (opts.json) return log(JSON.stringify(rows));
      log("id,userId,symbol,side,quantity,price,total,executedAt");
      rows.forEach((t) => log([t.id, t.userId, t.symbol, t.side, t.quantity, t.price, t.total, t.executedAt.toISOString()].join(",")));
      log(`${rows.length} trade(s) since ${opts.since.toISOString()}`);
      return 0;
    }

    if (!config.mongoUrl) throw new Error("MONGO_URL is not set");
    await mongoose.connect(config.mongoUrl);
    const p = migration.plan(...Object.values(await loadMongo()));

    if (opts.mode === "--dry-run") {
      if (opts.json) log(JSON.stringify({ blocking: p.blocking, users: p.users.map((u) => ({ userId: u.userId, cash: u.cash.toFixed(2), trades: u.trades.length, notes: u.notes, problems: u.problems })) }));
      else printPlan(p, log);
      log("Dry run: nothing was written.");
      return p.blocking.length ? 1 : 0;
    }

    if (opts.mode === "--migrate") {
      if (process.env.LEDGER_BACKEND === "postgres" && !opts.force) {
        throw new Error("LEDGER_BACKEND is postgres: the site already runs on Postgres, so copying old MongoDB cash would overwrite newer balances. Use --force only if you are sure.");
      }
      if (process.env.LEDGER_MAINTENANCE !== "1" && !opts.force) {
        throw new Error("Set LEDGER_MAINTENANCE=1 first (so no trade lands in MongoDB during the copy), or pass --force for a test run.");
      }
      printPlan(p, log);
      const results = await migration.apply(prisma, p);
      const conflicts = results.filter((r) => r.status === "conflict");
      results.forEach((r) => log(`  user ${r.userId}: ${r.status}${r.message ? ` - ${r.message}` : `, ${r.tradesCopied} copied, ${r.tradesAlready} already there`}`));
      log(conflicts.length ? `Done with ${conflicts.length} conflict(s). Do NOT switch LEDGER_BACKEND.` : "Copied. Now run --verify.");
      return conflicts.length ? 1 : 0;
    }

    const v = await migration.verify(prisma, p);
    if (opts.json) log(JSON.stringify(v));
    else {
      v.results.forEach((r) => log(`  user ${r.userId}: ${r.ok ? "match" : "MISMATCH"} · cash ${r.cash} · ${r.trades} trade(s) · ${r.holdings}${r.ok ? "" : `\n      ${r.mismatches.join("\n      ")}`}`));
      log(v.ok ? `All users match (${v.results.length}). Safe to set LEDGER_BACKEND=postgres.` : "MISMATCH: do NOT switch LEDGER_BACKEND. Send this output to Claude.");
    }
    return v.ok ? 0 : 1;
  } finally {
    await prisma.$disconnect();
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code || 0))
    .catch((err) => {
      console.error(`migrate-ledger: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { parseArgs };

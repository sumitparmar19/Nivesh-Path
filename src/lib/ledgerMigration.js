// One-time move of the money ledger from MongoDB to Postgres (Phase 3, PR B), as plain functions the CLI
// (scripts/migrate-ledger.js) and the tests share:
//   plan(users, purchases)   -> what would be copied, per user, with every rounding change and every blocking problem
//   apply(prisma, plan)      -> copies it (per user, in one transaction; repeat-safe: upserts keyed by the Mongo ids)
//   verify(prisma, plan)     -> cash and holdings must match to the cent, and the same trades must exist
//   tradesSince(prisma, t)   -> Postgres trades made after a time (what a rollback to MongoDB would be missing)
// MongoDB is only ever read. Money is rounded half-up to the Postgres scales: cash/total 2 places, price 4.
const { Prisma } = require("@prisma/client");
const { toSymbol } = require("../config");
const { buildHoldings } = require("./portfolio");

const STARTING_CASH = 100000;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/;
const SYMBOL_RE = /^[A-Z.]{1,10}$/;
const CENT = new Prisma.Decimal("0.01");

const D = (n) => new Prisma.Decimal(String(n));
const r2 = (n) => D(n).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const r4 = (n) => D(n).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
const idOf = (v) => (v === undefined || v === null ? "" : String(v));

/** Turns one `purchases` document into a Postgres trade row, or explains why it can't be copied. */
function convertTrade(doc, userId) {
  const id = idOf(doc._id);
  const problems = [];
  const notes = [];
  const symbol = toSymbol(doc.name || doc.symbol);
  const side = String(doc.transactionType || "").toLowerCase();
  const quantity = Number(doc.quantity);
  const rawPrice = Number(doc.price);

  if (!OBJECT_ID_RE.test(id)) problems.push(`trade id "${id}" is not an ObjectId`);
  if (!SYMBOL_RE.test(symbol)) problems.push(`symbol "${doc.name}" can't be stored as a ticker`);
  if (!["buy", "sell"].includes(side)) problems.push(`side "${doc.transactionType}" is not buy/sell`);
  if (!(quantity > 0)) problems.push(`quantity ${doc.quantity} is not positive`);
  else if (!Number.isInteger(quantity)) problems.push(`fractional quantity ${quantity} (decision D1: whole shares only)`);
  if (!(rawPrice > 0)) problems.push(`price ${doc.price} is not positive`);
  if (problems.length) return { id, problems };

  const price = r4(rawPrice);
  const storedTotal = Number.isFinite(Number(doc.total)) && Number(doc.total) > 0 ? Number(doc.total) : rawPrice * quantity;
  const total = r2(storedTotal);
  const recomputed = r2(price.times(quantity));
  if (!price.equals(D(rawPrice))) notes.push(`price ${rawPrice} -> ${price.toFixed(4)}`);
  if (!total.equals(D(storedTotal))) notes.push(`total ${storedTotal} -> ${total.toFixed(2)}`);
  if (!recomputed.equals(total)) notes.push(`stored total ${total.toFixed(2)} != price x quantity ${recomputed.toFixed(2)} (stored total kept: it is what moved the cash)`);

  // When the trade happened decides the order of buys and sells, and so the average cost. A row with no usable
  // date is never silently saved as 1970: it gets the creation time built into its MongoDB id, and says so.
  let executedAt = new Date(doc.timestamp || doc.createdAt || NaN);
  if (Number.isNaN(executedAt.getTime())) {
    executedAt = new Date(parseInt(id.slice(0, 8), 16) * 1000);
    notes.push(`no timestamp (${doc.timestamp === undefined ? "missing" : `"${doc.timestamp}"`}): using the time from its id, ${executedAt.toISOString()}`);
  }

  return {
    id,
    notes,
    row: {
      id,
      userId,
      symbol,
      side,
      quantity,
      price,
      total,
      priceSource: doc.priceSource === "client" ? "client" : "live",
      behaviorCheckedAt: doc.behaviorCheckedAt ? new Date(doc.behaviorCheckedAt) : null,
      idempotencyKey: typeof doc.idempotencyKey === "string" ? doc.idempotencyKey : null,
      executedAt,
    },
  };
}

/**
 * What the move would do. `users` and `purchases` are raw MongoDB documents.
 * Returns { users: [...per user], orphanTrades, legacyTrades, blocking } where blocking lists every problem
 * that stops --migrate (fractional shares, bad rows, negative cash).
 */
function plan(users, purchases) {
  const byUser = new Map();
  let legacyTrades = 0;
  for (const p of purchases) {
    const uid = idOf(p.userId);
    if (!uid) { legacyTrades += 1; continue; } // rows from before per-user accounts: never visible to anyone
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid).push(p);
  }

  const out = [];
  const blocking = [];
  for (const u of users) {
    const userId = idOf(u._id);
    const docs = byUser.get(userId) || [];
    byUser.delete(userId);
    const entry = {
      userId,
      mongoCash: u.cashBalance === undefined || u.cashBalance === null ? STARTING_CASH : Number(u.cashBalance),
      mongoDeposited: u.totalDeposited === undefined || u.totalDeposited === null ? STARTING_CASH : Number(u.totalDeposited),
      trades: [],
      notes: [],
      problems: [],
      mongoTrades: docs,
    };
    if (!OBJECT_ID_RE.test(userId)) entry.problems.push(`user id "${userId}" is not an ObjectId`);
    entry.cash = r2(entry.mongoCash);
    entry.totalDeposited = r2(entry.mongoDeposited);
    if (!entry.cash.equals(D(entry.mongoCash))) entry.notes.push(`cash ${entry.mongoCash} -> ${entry.cash.toFixed(2)}`);
    if (entry.cash.isNegative()) entry.problems.push(`cash is negative (${entry.mongoCash})`);
    if (entry.totalDeposited.isNegative()) entry.problems.push(`totalDeposited is negative (${entry.mongoDeposited})`);
    for (const doc of docs) {
      const t = convertTrade(doc, userId);
      if (t.problems) entry.problems.push(...t.problems.map((p) => `trade ${t.id}: ${p}`));
      else {
        entry.trades.push(t.row);
        entry.notes.push(...t.notes.map((n) => `trade ${t.id}: ${n}`));
      }
    }
    for (const p of entry.problems) blocking.push(`user ${userId}: ${p}`);
    out.push(entry);
  }
  // Trades whose user no longer exists (deleted accounts): nobody can see them, so they are not copied.
  const orphanTrades = [...byUser.values()].reduce((n, list) => n + list.length, 0);
  return { users: out, orphanTrades, orphanUsers: byUser.size, legacyTrades, blocking };
}

/** Holdings with cost basis to the cent, for comparing the two ledgers. */
function holdingsKey(trades) {
  return buildHoldings(trades)
    .map((h) => ({ symbol: h.symbol, quantity: h.quantity, cost: r2(D(h.avg_price).times(h.quantity)) }))
    .sort((a, b) => (a.symbol < b.symbol ? -1 : 1));
}

const pgToApi = (t) => ({ name: t.symbol, price: Number(t.price), quantity: t.quantity, transactionType: t.side, timestamp: t.executedAt });

/**
 * Copies one user's ledger. Refuses (and changes nothing) when Postgres already has trades for the user that
 * MongoDB doesn't: those were made after a cutover and copying the old cash over them would lose money.
 */
async function applyUser(prisma, entry) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.account.findUnique({ where: { userId: entry.userId } });
    if (existing) await tx.$queryRaw`SELECT 1 FROM accounts WHERE user_id = ${entry.userId} FOR UPDATE`;
    const pgTrades = await tx.trade.findMany({ where: { userId: entry.userId }, select: { id: true, behaviorCheckedAt: true } });
    const planned = new Set(entry.trades.map((t) => t.id));
    const extra = pgTrades.filter((t) => !planned.has(t.id));
    if (extra.length) {
      return { userId: entry.userId, status: "conflict", message: `Postgres has ${extra.length} trade(s) not in MongoDB (made after a cutover?) - left unchanged` };
    }
    if (existing) {
      await tx.account.update({ where: { userId: entry.userId }, data: { cash: entry.cash, totalDeposited: entry.totalDeposited } });
    } else {
      await tx.account.create({ data: { userId: entry.userId, cash: entry.cash, totalDeposited: entry.totalDeposited } });
    }
    const have = new Map(pgTrades.map((t) => [t.id, t]));
    const toCreate = entry.trades.filter((t) => !have.has(t.id));
    if (toCreate.length) await tx.trade.createMany({ data: toCreate });
    // Re-runs keep the Mirror's "checked" marks in step with MongoDB.
    for (const t of entry.trades) {
      const cur = have.get(t.id);
      const a = cur && cur.behaviorCheckedAt ? cur.behaviorCheckedAt.getTime() : null;
      const b = t.behaviorCheckedAt ? t.behaviorCheckedAt.getTime() : null;
      if (cur && a !== b) await tx.trade.update({ where: { id: t.id }, data: { behaviorCheckedAt: t.behaviorCheckedAt } });
    }
    return { userId: entry.userId, status: existing ? "updated" : "created", tradesCopied: toCreate.length, tradesAlready: entry.trades.length - toCreate.length };
  }, { maxWait: 10000, timeout: 60000 });
}

async function apply(prisma, p) {
  if (p.blocking.length) throw new Error(`Refusing to migrate: ${p.blocking.length} blocking problem(s); run --dry-run to see them`);
  const results = [];
  for (const entry of p.users) results.push(await applyUser(prisma, entry));
  return results;
}

/** Compares every user's Postgres ledger with MongoDB. Returns per-user results; ok only if all match. */
async function verify(prisma, p) {
  const results = [];
  for (const entry of p.users) {
    const mismatches = [];
    const account = await prisma.account.findUnique({ where: { userId: entry.userId } });
    const pgTrades = await prisma.trade.findMany({ where: { userId: entry.userId }, orderBy: [{ executedAt: "asc" }, { id: "asc" }] });
    if (!account) mismatches.push("no Postgres account");
    else {
      if (!D(account.cash).equals(entry.cash)) mismatches.push(`cash: MongoDB ${entry.cash.toFixed(2)} vs Postgres ${D(account.cash).toFixed(2)}`);
      if (!D(account.totalDeposited).equals(entry.totalDeposited)) mismatches.push("totalDeposited differs");
    }
    const mongoIds = new Set(entry.trades.map((t) => t.id));
    const pgIds = new Set(pgTrades.map((t) => t.id));
    const missing = [...mongoIds].filter((id) => !pgIds.has(id));
    const extra = [...pgIds].filter((id) => !mongoIds.has(id));
    if (missing.length) mismatches.push(`${missing.length} trade(s) missing in Postgres`);
    if (extra.length) mismatches.push(`${extra.length} trade(s) in Postgres only`);

    // Holdings from the raw MongoDB documents (as the live site computes them today) vs from Postgres.
    const before = holdingsKey(entry.mongoTrades);
    const after = holdingsKey(pgTrades.map(pgToApi));
    const bySym = (list) => Object.fromEntries(list.map((h) => [h.symbol, h]));
    const [b, a] = [bySym(before), bySym(after)];
    for (const sym of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const x = b[sym];
      const y = a[sym];
      if (!x || !y || x.quantity !== y.quantity) mismatches.push(`${sym}: ${x ? x.quantity : 0} shares in MongoDB vs ${y ? y.quantity : 0} in Postgres`);
      else if (x.cost.minus(y.cost).abs().greaterThan(CENT)) mismatches.push(`${sym}: cost basis ${x.cost.toFixed(2)} vs ${y.cost.toFixed(2)}`);
    }
    const checkedMongo = entry.trades.filter((t) => t.behaviorCheckedAt).length;
    const checkedPg = pgTrades.filter((t) => t.behaviorCheckedAt).length;
    if (checkedMongo !== checkedPg) mismatches.push(`checked trades: ${checkedMongo} vs ${checkedPg}`);

    results.push({
      userId: entry.userId,
      ok: mismatches.length === 0,
      cash: entry.cash.toFixed(2),
      trades: entry.trades.length,
      holdings: before.map((h) => `${h.symbol} ${h.quantity}`).join(", ") || "-",
      mismatches,
    });
  }
  return { ok: results.every((r) => r.ok), results };
}

/** Postgres trades made at or after `since`: what MongoDB would be missing after a rollback. */
async function tradesSince(prisma, since) {
  return prisma.trade.findMany({ where: { executedAt: { gte: since } }, orderBy: [{ executedAt: "asc" }, { id: "asc" }] });
}

module.exports = { plan, apply, applyUser, verify, tradesSince, convertTrade, STARTING_CASH };

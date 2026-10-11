// Postgres implementation of the ledger store (Phase 3): cash in `accounts`, trades in `trades`, through Prisma.
// Same interface as the MongoDB store, selected with LEDGER_BACKEND=postgres. Every trade runs in one database
// transaction that first locks the user's account row (SELECT ... FOR UPDATE), so concurrent orders for the same
// user queue up even across several web instances, and the CHECK constraints refuse negative cash or quantities.
// Money is NUMERIC in the database and Prisma Decimal in code; it becomes a JS number only in the API shape.
const { Prisma } = require("@prisma/client");
const { Types } = require("mongoose");
const { buildHoldings } = require("./portfolio");

const STARTING_CASH = 100000;
const OBJECT_ID_RE = /^[0-9a-f]{24}$/;
const TX_OPTIONS = { maxWait: 5000, timeout: 15000 };

const usd = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dec = (n) => new Prisma.Decimal(n);
const num = (d) => (d === null || d === undefined ? d : Number(d));

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** A Postgres row in the same shape the API (and the Mongo store) returns for a trade. */
function toApiTrade(t) {
  return {
    _id: t.id,
    userId: t.userId,
    name: t.symbol,
    price: num(t.price),
    quantity: t.quantity,
    total: num(t.total),
    transactionType: t.side,
    timestamp: t.executedAt,
    priceSource: t.priceSource,
    behaviorCheckedAt: t.behaviorCheckedAt || undefined,
    ...(t.idempotencyKey ? { idempotencyKey: t.idempotencyKey } : {}),
  };
}

const isUniqueViolation = (err) => err && err.code === "P2002";

/**
 * @param prisma       a PrismaClient
 * @param seedAccount  async (userId) => { cash, totalDeposited } | null - the opening balance for a user who has no
 *                     account row yet (their MongoDB balance), or null when the user doesn't exist
 * @param newId        trade id generator (24-hex, like a MongoDB ObjectId, so links from behavioral_events hold)
 */
function createPgLedgerStore({ prisma, seedAccount, newId = () => new Types.ObjectId().toHexString() }) {
  function checkUserId(userId) {
    const id = String(userId);
    if (!OBJECT_ID_RE.test(id)) throw httpError(401, "Account not found. Please log in again.");
    return id;
  }

  // Creates the account row on first use, with the user's MongoDB balance (or $100,000 for a new user).
  async function ensureAccount(userId) {
    const existing = await prisma.account.findUnique({ where: { userId }, select: { userId: true } });
    if (existing) return;
    const seed = seedAccount ? await seedAccount(userId) : { cash: STARTING_CASH, totalDeposited: STARTING_CASH };
    if (!seed) throw httpError(401, "Account not found. Please log in again.");
    await prisma.account.createMany({
      data: [{ userId, cash: dec(seed.cash ?? STARTING_CASH), totalDeposited: dec(seed.totalDeposited ?? STARTING_CASH) }],
      skipDuplicates: true, // ON CONFLICT DO NOTHING: two first requests at once both succeed
    });
  }

  async function lockAccount(tx, userId) {
    const rows = await tx.$queryRaw`SELECT cash, total_deposited FROM accounts WHERE user_id = ${userId} FOR UPDATE`;
    if (!rows.length) throw httpError(401, "Account not found. Please log in again.");
    return { cash: dec(rows[0].cash), totalDeposited: dec(rows[0].total_deposited) };
  }

  async function getAccount(userId) {
    const id = checkUserId(userId);
    await ensureAccount(id);
    const a = await prisma.account.findUnique({ where: { userId: id } });
    if (!a) throw httpError(401, "Account not found. Please log in again.");
    return { cashBalance: num(a.cash), totalDeposited: num(a.totalDeposited) };
  }

  async function findByKey(client, userId, idempotencyKey) {
    return client.trade.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  }

  /** Buy or sell. Inputs are already validated and priced by the ledger. */
  async function executeTrade({ userId, symbol, quantity, price, total, type, priceSource, idempotencyKey }) {
    const id = checkUserId(userId);
    await ensureAccount(id);
    try {
      return await prisma.$transaction(async (tx) => {
        const account = await lockAccount(tx, id);
        // Checked after taking the lock, so a retry that raced the original sees its committed trade.
        if (idempotencyKey) {
          const existing = await findByKey(tx, id, idempotencyKey);
          if (existing) return { transaction: toApiTrade(existing), newBalance: num(account.cash), replayed: true };
        }
        const cost = dec(total);
        const row = {
          id: newId(), userId: id, symbol, side: type, quantity, price: dec(price), total: cost,
          priceSource, idempotencyKey: idempotencyKey || null, executedAt: new Date(),
        };

        if (type === "buy") {
          if (account.cash.lt(cost)) {
            throw httpError(400, `Insufficient funds: this order costs ${usd(total)} but you have ${usd(num(account.cash))}.`);
          }
          const trade = await tx.trade.create({ data: row });
          const after = await tx.account.update({ where: { userId: id }, data: { cash: { decrement: cost } } });
          return { transaction: toApiTrade(trade), newBalance: num(after.cash) };
        }

        const history = await tx.trade.findMany({ where: { userId: id, symbol }, orderBy: [{ executedAt: "asc" }, { id: "asc" }] });
        const owned = buildHoldings(history.map(toApiTrade)).find((h) => h.symbol === symbol);
        const ownedQty = owned ? owned.quantity : 0;
        if (quantity > ownedQty) {
          throw httpError(400, `You own ${ownedQty} ${symbol} share${ownedQty === 1 ? "" : "s"}, so you can't sell ${quantity}.`);
        }
        const trade = await tx.trade.create({ data: row });
        const after = await tx.account.update({ where: { userId: id }, data: { cash: { increment: cost } } });
        return { transaction: toApiTrade(trade), newBalance: num(after.cash), avgCost: owned.avg_price };
      }, TX_OPTIONS);
    } catch (err) {
      // Same key committed by a request we didn't see (shouldn't happen under the row lock, but be safe).
      if (idempotencyKey && isUniqueViolation(err)) {
        const existing = await findByKey(prisma, id, idempotencyKey);
        const account = await prisma.account.findUnique({ where: { userId: id } });
        if (existing) return { transaction: toApiTrade(existing), newBalance: num(account && account.cash), replayed: true };
      }
      throw err;
    }
  }

  /** The user's trades, newest first by default. */
  async function listTrades(userId, { limit = 0, order = "desc" } = {}) {
    const rows = await prisma.trade.findMany({
      where: { userId: String(userId) },
      orderBy: [{ executedAt: order === "asc" ? "asc" : "desc" }, { id: order === "asc" ? "asc" : "desc" }],
      ...(limit ? { take: limit } : {}),
    });
    return rows.map(toApiTrade);
  }

  async function countTrades(userId, { checkedOnly = false } = {}) {
    return prisma.trade.count({ where: { userId: String(userId), ...(checkedOnly ? { behaviorCheckedAt: { not: null } } : {}) } });
  }

  async function findTrades(userId, ids) {
    const valid = ids.map(String).filter((i) => OBJECT_ID_RE.test(i));
    if (!valid.length) return [];
    return (await prisma.trade.findMany({ where: { userId: String(userId), id: { in: valid } } })).map(toApiTrade);
  }

  async function markChecked(userId, tradeId, at = new Date()) {
    await prisma.trade.updateMany({ where: { id: String(tradeId), userId: String(userId) }, data: { behaviorCheckedAt: at } });
  }

  async function markCheckedIfUnset(userId, tradeId, at) {
    await prisma.trade.updateMany({
      where: { id: String(tradeId), userId: String(userId), behaviorCheckedAt: null },
      data: { behaviorCheckedAt: at },
    });
  }

  /** All users' trades in [from, to) without a mark get `at`. Returns how many were marked. */
  async function markCheckedBetween(from, to, at) {
    const r = await prisma.trade.updateMany({
      where: { executedAt: { gte: from, lt: to }, behaviorCheckedAt: null },
      data: { behaviorCheckedAt: at },
    });
    return r.count;
  }

  /** "Start over": delete the user's trades and put the account back to $100,000, under the same row lock. */
  async function resetAccount(userId) {
    const id = checkUserId(userId);
    await ensureAccount(id);
    return prisma.$transaction(async (tx) => {
      await lockAccount(tx, id);
      const removed = await tx.trade.deleteMany({ where: { userId: id } });
      await tx.account.update({ where: { userId: id }, data: { cash: dec(STARTING_CASH), totalDeposited: dec(STARTING_CASH) } });
      return { cashBalance: STARTING_CASH, tradesRemoved: removed.count };
    }, TX_OPTIONS);
  }

  /** Account deletion: the account row and (by ON DELETE CASCADE) all its trades. */
  async function deleteUser(userId) {
    await prisma.account.deleteMany({ where: { userId: String(userId) } });
  }

  async function usersWithTrades() {
    const rows = await prisma.trade.findMany({ distinct: ["userId"], select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  return {
    kind: "postgres",
    getAccount, executeTrade, listTrades, countTrades, findTrades,
    markChecked, markCheckedIfUnset, markCheckedBetween, resetAccount, deleteUser, usersWithTrades,
  };
}

module.exports = { createPgLedgerStore, toApiTrade, STARTING_CASH };

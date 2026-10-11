// MongoDB implementation of the ledger store: cash on the User document, trades in the `purchases` collection.
// This is today's (pre-Phase 3) ledger, unchanged in behaviour, behind the same interface as the Postgres store
// so LEDGER_BACKEND can switch between them. It stays as the rollback path until the Mongo ledger is retired.
const { buildHoldings } = require("./portfolio");

const STARTING_CASH = 100000;
const round2 = (n) => Math.round(n * 100) / 100;
const usd = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// One in-flight trade per user, so two quick sells can't both pass the holdings check.
// (Single web instance only; the Postgres store uses a row lock instead.)
const userLocks = new Map();
async function withUserLock(userId, fn) {
  const key = String(userId);
  const previous = userLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  userLocks.set(key, chain);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (userLocks.get(key) === chain) userLocks.delete(key);
  }
}

function createMongoLedgerStore({ User, Purchase }) {
  // Accounts created before the ledger existed get their starting balance on first use.
  async function ensureWallet(userId) {
    await User.updateOne(
      { _id: userId, cashBalance: { $exists: false } },
      { $set: { cashBalance: STARTING_CASH, totalDeposited: STARTING_CASH } }
    );
  }

  async function getAccount(userId) {
    await ensureWallet(userId);
    const user = await User.findById(userId);
    if (!user) throw httpError(401, "Account not found. Please log in again.");
    return { cashBalance: round2(Number(user.cashBalance)), totalDeposited: round2(Number(user.totalDeposited || STARTING_CASH)) };
  }

  async function replay(userId, idempotencyKey) {
    if (!idempotencyKey || !Purchase.findOne) return null;
    const existing = await Purchase.findOne({ userId, idempotencyKey });
    if (!existing) return null;
    const user = await User.findById(userId);
    return { transaction: existing, newBalance: round2(user ? user.cashBalance : 0), replayed: true };
  }

  /** Buy or sell. Inputs are already validated and priced by the ledger. */
  async function executeTrade(order) {
    try {
      return await executeLocked(order);
    } catch (err) {
      // Duplicate idempotency key (unique index): the same order was saved by another request; answer with it.
      const again = order.idempotencyKey && err && err.code === 11000 ? await replay(order.userId, order.idempotencyKey) : null;
      if (again) return again;
      throw err;
    }
  }

  async function executeLocked({ userId, symbol, quantity, price, total, type, priceSource, idempotencyKey }) {
    return withUserLock(userId, async () => {
      const again = await replay(userId, idempotencyKey);
      if (again) return again;
      await ensureWallet(userId);
      const extra = idempotencyKey ? { idempotencyKey } : {};

      if (type === "buy") {
        const user = await User.findOneAndUpdate(
          { _id: userId, cashBalance: { $gte: total } },
          { $inc: { cashBalance: -total } },
          { new: true }
        );
        if (!user) {
          const existing = await User.findById(userId);
          if (!existing) throw httpError(401, "Account not found. Please log in again.");
          throw httpError(400, `Insufficient funds: this order costs ${usd(total)} but you have ${usd(existing.cashBalance)}.`);
        }
        try {
          const transaction = await Purchase.create({
            userId, name: symbol, price, quantity, total, transactionType: "buy", priceSource, ...extra,
          });
          return { transaction, newBalance: round2(user.cashBalance) };
        } catch (err) {
          // Never lose money if the trade record fails to save.
          await User.updateOne({ _id: userId }, { $inc: { cashBalance: total } });
          throw err;
        }
      }

      const holdings = buildHoldings(await Purchase.find({ userId }).lean());
      const owned = holdings.find((h) => h.symbol === symbol);
      const ownedQty = owned ? owned.quantity : 0;
      if (quantity > ownedQty) {
        throw httpError(400, `You own ${ownedQty} ${symbol} share${ownedQty === 1 ? "" : "s"}, so you can't sell ${quantity}.`);
      }
      const transaction = await Purchase.create({
        userId, name: symbol, price, quantity, total, transactionType: "sell", priceSource, ...extra,
      });
      const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { cashBalance: total } }, { new: true });
      return { transaction, newBalance: round2(user ? user.cashBalance : 0), avgCost: owned.avg_price };
    });
  }

  /** The user's trades, newest first by default. */
  async function listTrades(userId, { limit = 0, order = "desc" } = {}) {
    let q = Purchase.find({ userId }).sort({ timestamp: order === "asc" ? 1 : -1 });
    if (limit) q = q.limit(limit);
    return q.lean();
  }

  async function countTrades(userId, { checkedOnly = false } = {}) {
    const filter = checkedOnly ? { userId, behaviorCheckedAt: { $exists: true } } : { userId };
    return Purchase.countDocuments ? Purchase.countDocuments(filter) : (await Purchase.find(filter).lean()).length;
  }

  async function findTrades(userId, ids) {
    if (!ids.length) return [];
    return Purchase.find({ userId, _id: { $in: ids } }).lean();
  }

  async function markChecked(userId, tradeId, at = new Date()) {
    await Purchase.updateOne({ _id: tradeId, userId }, { $set: { behaviorCheckedAt: at } });
  }

  async function markCheckedIfUnset(userId, tradeId, at) {
    await Purchase.updateOne({ _id: tradeId, userId, behaviorCheckedAt: { $exists: false } }, { $set: { behaviorCheckedAt: at } });
  }

  /** All users' trades in [from, to) without a mark get `at`. Returns how many were marked. */
  async function markCheckedBetween(from, to, at) {
    const r = await Purchase.updateMany(
      { timestamp: { $gte: from, $lt: to }, behaviorCheckedAt: { $exists: false } },
      { $set: { behaviorCheckedAt: at } }
    );
    return (r && (r.modifiedCount ?? r.nModified)) || 0;
  }

  /** "Start over": delete the user's trades and put the wallet back to $100,000 (serialised with trades). */
  async function resetAccount(userId) {
    return withUserLock(userId, async () => {
      const removed = await Purchase.deleteMany({ userId });
      const user = await User.findOneAndUpdate(
        { _id: userId },
        { $set: { cashBalance: STARTING_CASH, totalDeposited: STARTING_CASH } },
        { new: true }
      );
      if (!user) throw httpError(401, "Account not found. Please log in again.");
      return { cashBalance: STARTING_CASH, tradesRemoved: (removed && removed.deletedCount) || 0 };
    });
  }

  /** Account deletion: remove the user's trades (the User document itself is deleted by the account route). */
  async function deleteUser(userId) {
    await Purchase.deleteMany({ userId });
  }

  async function usersWithTrades() {
    const ids = Purchase.distinct
      ? await Purchase.distinct("userId", { userId: { $exists: true, $ne: null } })
      : (await Purchase.find({}).lean()).map((t) => t.userId).filter(Boolean);
    return [...new Set(ids.map(String))];
  }

  return {
    kind: "mongo",
    getAccount, executeTrade, listTrades, countTrades, findTrades,
    markChecked, markCheckedIfUnset, markCheckedBetween, resetAccount, deleteUser, usersWithTrades,
  };
}

module.exports = { createMongoLedgerStore, withUserLock, STARTING_CASH };

// Virtual cash ledger: executes buys and sells for one user against their $100k paper-trading balance.
// Cash moves with atomic MongoDB $inc updates, and trades for the same user are serialised.
const { toSymbol } = require("../config");
const { buildHoldings } = require("./portfolio");

const STARTING_CASH = 100000;
const SYMBOL_RE = /^[A-Z.]{1,10}$/;

const round2 = (n) => Math.round(n * 100) / 100;
const usd = (n) => Number(n).toLocaleString("en-US", { style: "currency", currency: "USD" });

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// One in-flight trade per user, so two quick sells can't both pass the holdings check.
// (Single web instance today; a Redis lock would replace this when scaling out.)
const userLocks = new Map();
async function withUserLock(userId, fn) {
  const previous = userLocks.get(userId) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const chain = previous.then(() => current);
  userLocks.set(userId, chain);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (userLocks.get(userId) === chain) userLocks.delete(userId);
  }
}

function createLedger({ User, Purchase, quotes }) {
  // Accounts created before the ledger existed get their starting balance on first use.
  async function ensureWallet(userId) {
    await User.updateOne(
      { _id: userId, cashBalance: { $exists: false } },
      { $set: { cashBalance: STARTING_CASH, totalDeposited: STARTING_CASH } }
    );
  }

  async function livePrice(symbol, fallback) {
    try {
      const quote = await quotes.getQuote(symbol);
      if (quote && quote.c > 0) return { price: quote.c, source: "live" };
    } catch (err) {
      // Quote provider down or not configured: fall back to the price the client saw.
    }
    if (fallback > 0) return { price: fallback, source: "client" };
    throw httpError(503, "Live price is unavailable right now. Please try again in a moment.");
  }

  async function execute({ userId, symbol: rawSymbol, quantity: rawQty, price: clientPrice, type: rawType }) {
    const type = String(rawType || "").toLowerCase();
    if (!["buy", "sell"].includes(type)) throw httpError(400, "type must be BUY or SELL");
    const symbol = toSymbol(rawSymbol);
    if (!SYMBOL_RE.test(symbol)) throw httpError(400, "Invalid stock symbol");
    const quantity = Number(rawQty);
    if (!(quantity > 0) || !Number.isFinite(quantity)) throw httpError(400, "Quantity must be greater than 0");

    return withUserLock(userId, async () => {
      const { price, source } = await livePrice(symbol, Number(clientPrice));
      const total = round2(price * quantity);
      await ensureWallet(userId);

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
            userId, name: symbol, price, quantity, total, transactionType: "buy", priceSource: source,
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
        userId, name: symbol, price, quantity, total, transactionType: "sell", priceSource: source,
      });
      const user = await User.findOneAndUpdate({ _id: userId }, { $inc: { cashBalance: total } }, { new: true });
      return { transaction, newBalance: round2(user ? user.cashBalance : 0), avgCost: owned.avg_price };
    });
  }

  async function summary(userId) {
    await ensureWallet(userId);
    const user = await User.findById(userId);
    if (!user) throw httpError(401, "Account not found. Please log in again.");
    const holdings = buildHoldings(await Purchase.find({ userId }).lean());
    const prices = holdings.length ? await quotes.getQuotes(holdings.map((h) => h.symbol)).catch(() => ({})) : {};
    const positions = holdings.map((h) => {
      const current = prices[h.symbol] && prices[h.symbol].c > 0 ? prices[h.symbol].c : h.avg_price;
      return { ...h, current_price: current, market_value: round2(current * h.quantity), cost_basis: round2(h.avg_price * h.quantity) };
    });
    const holdingsValue = round2(positions.reduce((s, p) => s + p.market_value, 0));
    const costBasis = round2(positions.reduce((s, p) => s + p.cost_basis, 0));
    const cashBalance = round2(Number(user.cashBalance));
    const totalDeposited = round2(Number(user.totalDeposited || STARTING_CASH));
    const totalValue = round2(cashBalance + holdingsValue);
    return {
      cashBalance,
      totalDeposited,
      holdingsValue,
      totalValue,
      unrealizedPnl: round2(holdingsValue - costBasis),
      totalPnl: round2(totalValue - totalDeposited),
      totalPnlPercent: totalDeposited ? round2(((totalValue - totalDeposited) / totalDeposited) * 100) : 0,
      positions,
    };
  }

  // "Start over": delete the user's trades and put the wallet back to $100,000 (serialised with trades).
  async function reset(userId) {
    return withUserLock(String(userId), async () => {
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

  return { execute, summary, reset };
}

module.exports = { createLedger, STARTING_CASH };

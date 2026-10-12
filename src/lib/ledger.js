// Virtual cash ledger: validates and prices buys and sells for one user against their $100k paper-trading balance,
// then hands them to the ledger store (MongoDB today, Postgres after the Phase 3 cutover; see ledgerStore.*.js),
// which applies them atomically. LEDGER_MAINTENANCE pauses every money-moving action during the cutover.
const { toSymbol } = require("../config");
const { buildHoldings } = require("./portfolio");
const { createMongoLedgerStore, STARTING_CASH } = require("./ledgerStore.mongo");

const SYMBOL_RE = /^[A-Z.]{1,10}$/;
const MAX_QUANTITY = 1000000; // whole shares only (decision D1); also keeps the Postgres INTEGER column safe
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;
const REUSED_KEY_MESSAGE = "This order key was already used for a different order.";
const MAINTENANCE_MESSAGE = "Trading is paused for a few minutes while we upgrade the ledger. Please try again shortly.";

const round2 = (n) => Math.round(n * 100) / 100;

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

/** Does a saved trade match the order now being placed (ticker, side, share count)? */
function sameOrder(trade, { symbol, type, quantity }) {
  return toSymbol(trade.name) === symbol && trade.transactionType === type && Number(trade.quantity) === quantity;
}

/** A valid Idempotency-Key header value, or undefined (absent). Malformed keys are a 400. */
function idempotencyKey(raw) {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const key = String(raw);
  if (!IDEMPOTENCY_KEY_RE.test(key)) throw httpError(400, "Idempotency-Key must be 8-100 letters, digits, '-' or '_'");
  return key;
}

/**
 * @param store        a ledger store (createMongoLedgerStore / createPgLedgerStore). For older callers,
 *                     { User, Purchase } builds the MongoDB store.
 * @param maintenance  () => boolean, true while trading is paused (LEDGER_MAINTENANCE=1)
 */
function createLedger({ store, User, Purchase, quotes, maintenance = () => false }) {
  const ledgerStore = store || createMongoLedgerStore({ User, Purchase });

  function assertOpen() {
    if (maintenance()) throw httpError(503, MAINTENANCE_MESSAGE);
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

  async function execute({ userId, symbol: rawSymbol, quantity: rawQty, price: clientPrice, type: rawType, idempotencyKey: rawKey }) {
    assertOpen();
    const type = String(rawType || "").toLowerCase();
    if (!["buy", "sell"].includes(type)) throw httpError(400, "type must be BUY or SELL");
    const symbol = toSymbol(rawSymbol);
    if (!SYMBOL_RE.test(symbol)) throw httpError(400, "Invalid stock symbol");
    const quantity = Number(rawQty);
    if (!(quantity > 0) || !Number.isFinite(quantity)) throw httpError(400, "Quantity must be greater than 0");
    if (!Number.isInteger(quantity)) throw httpError(400, "Quantity must be a whole number of shares");
    if (quantity > MAX_QUANTITY) throw httpError(400, `Quantity can be at most ${MAX_QUANTITY.toLocaleString("en-US")} shares`);
    const key = idempotencyKey(rawKey);

    const { price, source } = await livePrice(symbol, Number(clientPrice));
    const total = round2(price * quantity);
    const result = await ledgerStore.executeTrade({ userId: String(userId), symbol, quantity, price, total, type, priceSource: source, idempotencyKey: key });
    // A key belongs to one order. Reusing it for a different order is a client bug: refuse it rather than
    // silently answering with the earlier trade (same rule as Stripe). Price may differ: it's re-quoted live.
    if (result.replayed && !sameOrder(result.transaction, { symbol, type, quantity })) {
      throw httpError(422, REUSED_KEY_MESSAGE);
    }
    return result;
  }

  async function summary(userId) {
    const [account, trades] = await Promise.all([ledgerStore.getAccount(userId), ledgerStore.listTrades(userId, { order: "asc" })]);
    const holdings = buildHoldings(trades);
    const prices = holdings.length ? await quotes.getQuotes(holdings.map((h) => h.symbol)).catch(() => ({})) : {};
    const positions = holdings.map((h) => {
      const current = prices[h.symbol] && prices[h.symbol].c > 0 ? prices[h.symbol].c : h.avg_price;
      return { ...h, current_price: current, market_value: round2(current * h.quantity), cost_basis: round2(h.avg_price * h.quantity) };
    });
    const holdingsValue = round2(positions.reduce((s, p) => s + p.market_value, 0));
    const costBasis = round2(positions.reduce((s, p) => s + p.cost_basis, 0));
    const cashBalance = round2(account.cashBalance);
    const totalDeposited = round2(account.totalDeposited || STARTING_CASH);
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

  /** Current holdings with average cost (no prices). */
  async function holdings(userId) {
    return buildHoldings(await ledgerStore.listTrades(userId, { order: "asc" }));
  }

  /** Tickers that at least one user holds now (net shares > 0), sorted: what the nightly job snapshots. */
  async function heldSymbols() {
    const symbols = new Set();
    for (const userId of await ledgerStore.usersWithTrades()) {
      for (const h of await holdings(userId)) if (h.quantity > 0) symbols.add(h.symbol);
    }
    return [...symbols].sort();
  }

  // "Start over": delete the user's trades and put the wallet back to $100,000 (serialised with trades).
  async function reset(userId) {
    assertOpen();
    return ledgerStore.resetAccount(String(userId));
  }

  return { execute, summary, holdings, heldSymbols, reset, assertOpen, store: ledgerStore };
}

module.exports = { createLedger, idempotencyKey, STARTING_CASH, MAX_QUANTITY, MAINTENANCE_MESSAGE, REUSED_KEY_MESSAGE };

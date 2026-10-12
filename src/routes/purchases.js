// Per-user trading and portfolio API: virtual-cash buys/sells, trade history, holdings and wallet summary.
// Every route requires a valid JWT and only ever reads or writes the caller's own trades.
const express = require("express");
const { createLedger } = require("../lib/ledger");
const { requireAuth } = require("../middleware/auth");
const { logger } = require("../lib/logger");
const { recordTrade } = require("../lib/metrics");

function purchaseRoutes({ ledger: sharedLedger, Purchase, User, quotes, aiClient, BehaviorEvent, detector }) {
  const router = express.Router();
  const ledger = sharedLedger || createLedger({ User, Purchase, quotes });

  // Accepts the new shape { symbol, quantity, price, type: "BUY"|"SELL" }
  // and the Phase 1 shape { name, quantity, price, transactionType: "buy"|"sell" }.
  async function trade(req, res, next) {
    try {
      const body = req.body || {};
      const result = await ledger.execute({
        userId: req.user.id,
        symbol: body.symbol || body.name,
        quantity: body.quantity,
        price: body.price,
        type: body.type || body.transactionType,
        idempotencyKey: req.get("Idempotency-Key"),
      });
      const tx = result.transaction;

      // A retry of an order that already went through: same answer, nothing new to remember or check.
      recordTrade(tx.transactionType, result.replayed ? "replayed" : "filled");
      if (result.replayed) {
        return res.status(200).json({ success: true, newBalance: result.newBalance, transaction: tx, purchase: tx, behavior: null, replayed: true });
      }

      // Feed this user's AI memory; never block or fail the trade on it.
      if (aiClient) {
        aiClient
          .ingestTransactions(req.user.id, [
            { symbol: tx.name, quantity: tx.quantity, price: tx.price, transaction_type: tx.transactionType, timestamp: tx.timestamp },
          ])
          .catch((err) => logger.warn("AI ingest skipped: %s", err.message));
      }

      // Behavioral Mirror: wait at most ~1.5s so the trade panel can show a note; detection keeps running (and
      // saving) in the background if it takes longer, and it can never fail the trade.
      let behavior = null;
      if (detector) {
        behavior = await detector.detectWithin({ userId: req.user.id, trade: tx, avgCost: result.avgCost }).catch(() => null);
      }

      return res.status(201).json({
        success: true, newBalance: result.newBalance, transaction: tx, purchase: tx,
        behavior: behavior && behavior.map(({ _id, patternType, severity, symbol, facts }) => ({ _id, patternType, severity, symbol, facts })),
      });
    } catch (err) {
      return next(err);
    }
  }

  router.post(["/store-purchase", "/api/store-purchase", "/api/trades"], requireAuth, trade);

  router.get("/api/transactions", requireAuth, async (req, res, next) => {
    try {
      res.json(await ledger.store.listTrades(req.user.id, { limit: 500 }));
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/portfolio/holdings", requireAuth, async (req, res, next) => {
    try {
      res.json(await ledger.holdings(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  // Wallet + portfolio summary: cash, holdings value at live prices, total value and P&L.
  router.get(["/api/portfolio/cash-balance", "/api/portfolio/summary"], requireAuth, async (req, res, next) => {
    try {
      res.json(await ledger.summary(req.user.id));
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/portfolio/reset", requireAuth, async (req, res, next) => {
    try {
      if ((req.body || {}).confirm !== "RESET") return res.status(400).json({ error: "Type RESET to confirm" });
      const result = await ledger.reset(req.user.id);
      if (BehaviorEvent) {
        // Their trades are gone, so are the patterns found in them (best effort: never fail the reset).
        await BehaviorEvent.deleteMany({ userId: req.user.id }).catch((err) => logger.warn("Patterns not cleared: %s", err.message));
      }
      if (aiClient && aiClient.deleteMemory) {
        aiClient.deleteMemory(req.user.id).catch((err) => logger.warn("AI memory not cleared: %s", err.message));
      }
      return res.json({ success: true, ...result });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = purchaseRoutes;

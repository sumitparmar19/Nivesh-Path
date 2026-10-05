// Per-user trading and portfolio API: virtual-cash buys/sells, trade history, holdings and wallet summary.
// Every route requires a valid JWT and only ever reads or writes the caller's own trades.
const express = require("express");
const { buildHoldings } = require("../lib/portfolio");
const { createLedger } = require("../lib/ledger");
const { requireAuth } = require("../middleware/auth");

function purchaseRoutes({ Purchase, User, quotes, aiClient }) {
  const router = express.Router();
  const ledger = createLedger({ User, Purchase, quotes });

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
      });
      const tx = result.transaction;

      // Feed this user's AI memory; never block or fail the trade on it.
      if (aiClient) {
        aiClient
          .ingestTransactions(req.user.id, [
            { symbol: tx.name, quantity: tx.quantity, price: tx.price, transaction_type: tx.transactionType, timestamp: tx.timestamp },
          ])
          .catch((err) => console.warn("AI ingest skipped:", err.message));
      }

      return res.status(201).json({ success: true, newBalance: result.newBalance, transaction: tx, purchase: tx });
    } catch (err) {
      return next(err);
    }
  }

  router.post(["/store-purchase", "/api/store-purchase", "/api/trades"], requireAuth, trade);

  router.get(["/transactions", "/api/transactions"], requireAuth, async (req, res, next) => {
    try {
      const rows = await Purchase.find({ userId: req.user.id }).sort({ timestamp: -1 }).limit(500).lean();
      res.json(rows);
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/portfolio/holdings", requireAuth, async (req, res, next) => {
    try {
      res.json(buildHoldings(await Purchase.find({ userId: req.user.id }).lean()));
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
      if (aiClient && aiClient.deleteMemory) {
        aiClient.deleteMemory(req.user.id).catch((err) => console.warn("AI memory not cleared:", err.message));
      }
      return res.json({ success: true, ...result });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = purchaseRoutes;

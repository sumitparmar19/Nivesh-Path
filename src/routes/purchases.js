// Transaction history: store buys/sells, list them, and derive current holdings.
const express = require("express");
const { buildHoldings } = require("../lib/portfolio");

function purchaseRoutes({ Purchase, aiClient }) {
  const router = express.Router();

  async function storePurchase(req, res) {
    try {
      const { name, price, quantity, total, transactionType } = req.body || {};
      if (!name || !price || !quantity || !total || !transactionType) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (!["buy", "sell"].includes(transactionType)) {
        return res.status(400).json({ error: "transactionType must be 'buy' or 'sell'" });
      }
      const purchase = await Purchase.create({
        name: String(name).toUpperCase(),
        price: Number(price),
        quantity: Number(quantity),
        total: Number(total),
        transactionType,
      });

      // Feed the AI advisor's vector store; never block or fail the purchase on it.
      aiClient
        .ingestTransactions("anonymous", [
          {
            symbol: purchase.name,
            quantity: purchase.quantity,
            price: purchase.price,
            transaction_type: purchase.transactionType,
            timestamp: purchase.timestamp,
          },
        ])
        .catch((err) => console.warn("AI ingest skipped:", err.message));

      return res.status(201).json({ message: "Purchase stored successfully!", purchase });
    } catch (err) {
      console.error("Error storing purchase:", err);
      return res.status(500).json({ error: "Error storing purchase" });
    }
  }

  router.post("/store-purchase", storePurchase);
  router.post("/api/store-purchase", storePurchase);

  router.get(["/transactions", "/api/transactions"], async (req, res) => {
    try {
      const rows = await Purchase.find().sort({ timestamp: -1 }).limit(500).lean();
      res.json(rows);
    } catch (err) {
      console.error("Error fetching transactions:", err);
      res.status(500).json({ error: "Error fetching transactions" });
    }
  });

  router.get("/api/portfolio/holdings", async (req, res) => {
    try {
      const rows = await Purchase.find().lean();
      res.json(buildHoldings(rows));
    } catch (err) {
      console.error("Error building holdings:", err);
      res.status(500).json({ error: "Error building holdings" });
    }
  });

  return router;
}

module.exports = purchaseRoutes;

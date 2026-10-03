// Portfolio AI Advisor: enriches holdings with live prices and forwards to the AI service.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { buildHoldings } = require("../lib/portfolio");

function aiRoutes({ Purchase, quotes, aiClient }) {
  const router = express.Router();

  // Each analysis is a paid LLM call, so cap it per client.
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });

  router.post("/api/ai/analyze-portfolio", limiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      let holdings = Array.isArray(body.holdings) ? body.holdings : null;
      if (!holdings || holdings.length === 0) {
        holdings = buildHoldings(await Purchase.find().lean());
      }
      if (holdings.length === 0) {
        return res.status(400).json({ error: "No holdings yet - buy a stock or send a holdings array." });
      }

      const symbols = [...new Set(holdings.map((h) => String(h.symbol).toUpperCase()))];
      const prices = await quotes.getQuotes(symbols).catch(() => ({}));
      const enriched = holdings.map((h) => {
        const symbol = String(h.symbol).toUpperCase();
        return {
          symbol,
          quantity: Number(h.quantity),
          avg_price: Number(h.avg_price ?? h.avgPrice),
          current_price: h.current_price ?? (prices[symbol] ? prices[symbol].c : undefined),
        };
      });

      const result = await aiClient.analyzePortfolio({
        user_id: req.userId || "anonymous",
        holdings: enriched,
        question: body.question || undefined,
        risk_profile: body.risk_profile || "moderate",
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = aiRoutes;

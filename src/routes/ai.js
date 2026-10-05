// Portfolio AI Advisor: enriches holdings with live prices and forwards to the AI service.
const express = require("express");
const rateLimit = require("express-rate-limit");
const { buildHoldings } = require("../lib/portfolio");
const { requireAuth } = require("../middleware/auth");

function aiRoutes({ Purchase, Analysis, quotes, aiClient }) {
  const router = express.Router();

  // Each analysis is a paid LLM call, so cap it per user.
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
  });

  router.post("/api/ai/analyze-portfolio", requireAuth, limiter, async (req, res, next) => {
    try {
      const body = req.body || {};
      let holdings = Array.isArray(body.holdings) ? body.holdings : null;
      if (!holdings || holdings.length === 0) {
        holdings = buildHoldings(await Purchase.find({ userId: req.user.id }).lean());
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

      const riskProfile = ["conservative", "moderate", "aggressive"].includes(body.risk_profile) ? body.risk_profile : "moderate";
      const question = body.question ? String(body.question).slice(0, 1000) : undefined;
      const result = await aiClient.analyzePortfolio({
        user_id: req.user.id,
        holdings: enriched,
        question,
        risk_profile: riskProfile,
      });

      // Save the analysis so the user can reopen it later; a save failure never hides the answer.
      let analysisId;
      if (Analysis) {
        try {
          const saved = await Analysis.create({ userId: req.user.id, question, riskProfile, holdings: enriched, result });
          analysisId = String(saved._id);
        } catch (err) {
          console.warn("Analysis not saved:", err.message);
        }
      }
      res.json({ ...result, analysisId });
    } catch (err) {
      next(err);
    }
  });

  // Saved analyses, newest first (summary fields only; open one for the full result).
  router.get("/api/ai/history", requireAuth, async (req, res, next) => {
    try {
      if (!Analysis) return res.json([]);
      const rows = await Analysis.find({ userId: req.user.id }).sort({ createdAt: -1 }).limit(30).lean();
      res.json(rows.map((a) => ({
        id: String(a._id),
        createdAt: a.createdAt,
        question: a.question || null,
        riskProfile: a.riskProfile,
        result: { insight: a.result && a.result.insight ? { risk_level: a.result.insight.risk_level, summary: a.result.insight.summary } : null },
      })));
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/ai/history/:id", requireAuth, async (req, res, next) => {
    try {
      if (!Analysis || !/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Analysis not found" });
      const a = await Analysis.findOne({ _id: req.params.id, userId: req.user.id });
      if (!a) return res.status(404).json({ error: "Analysis not found" });
      res.json({ id: String(a._id), createdAt: a.createdAt, question: a.question || null, riskProfile: a.riskProfile, holdings: a.holdings, result: a.result });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/api/ai/history/:id", requireAuth, async (req, res, next) => {
    try {
      if (!Analysis || !/^[a-f0-9]{24}$/i.test(req.params.id)) return res.status(404).json({ error: "Analysis not found" });
      const result = await Analysis.deleteOne({ _id: req.params.id, userId: req.user.id });
      if (!result || !result.deletedCount) return res.status(404).json({ error: "Analysis not found" });
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // What the advisor remembers about the caller: trades in MongoDB vs trades embedded in ChromaDB.
  async function memoryResponse(req, ai) {
    const tradesInDatabase = Purchase.countDocuments
      ? await Purchase.countDocuments({ userId: req.user.id })
      : (await Purchase.find({ userId: req.user.id }).lean()).length;
    if (!ai) return { tradesInDatabase, aiReachable: false };
    return {
      tradesInDatabase,
      aiReachable: true,
      indexedTrades: ai.indexed_trades,
      durableStorage: ai.durable_storage,
      index: ai.index,
      patterns: ai.patterns || [],
    };
  }

  router.get("/api/ai/memory", requireAuth, async (req, res, next) => {
    try {
      const ai = await aiClient.memory(req.user.id).catch(() => null); // AI down -> still answer
      res.json(await memoryResponse(req, ai));
    } catch (err) {
      next(err);
    }
  });

  router.post("/api/ai/memory/rebuild", requireAuth, limiter, async (req, res, next) => {
    try {
      const ai = await aiClient.rebuildMemory(req.user.id);
      res.json(await memoryResponse(req, ai));
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = aiRoutes;

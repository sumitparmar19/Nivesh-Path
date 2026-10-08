// Behavioral Mirror API: the caller's detected patterns, a summary with behavioral scores, and an AI insight.
// Every route requires a JWT and only touches the caller's own events (filtered by req.user.id).
const express = require("express");
const mongoose = require("mongoose");
const { requireAuth } = require("../middleware/auth");
const rules = require("../lib/behaviorRules");

const TYPES = ["panic_sell", "fomo_buy", "overconcentration"];
const SEVERITIES = ["low", "medium", "high"];
const MAX_LIMIT = 100;

const isObjectId = (id) => mongoose.isValidObjectId(id);
const notFound = (res) => res.status(404).json({ error: "Pattern not found" });

function patternRoutes({ BehaviorEvent, Purchase, ledger, aiClient }) {
  const router = express.Router();

  // Counts, unread total and scores. Shared by GET /summary and POST /analyze.
  async function buildSummary(userId) {
    const [events, tradeCount, portfolio] = await Promise.all([
      BehaviorEvent.find({ userId }).sort({ createdAt: -1 }).limit(500).lean(),
      Purchase.countDocuments({ userId }),
      ledger.summary(userId).catch(() => null),
    ]);
    const byType = Object.fromEntries(TYPES.map((t) => [t, 0]));
    const flagged = new Set();
    let unreadCount = 0;
    for (const e of events) {
      byType[e.patternType] = (byType[e.patternType] || 0) + 1;
      if (!e.acknowledged) unreadCount += 1;
      if (e.patternType !== "overconcentration" && e.tradeId) flagged.add(String(e.tradeId));
    }
    const shares = portfolio ? rules.concentration({ positions: portfolio.positions, cashBalance: portfolio.cashBalance }) : [];
    const largest = shares.reduce((best, s) => (!best || s.percent > best.percent ? s : best), null);
    return {
      totalPatterns: events.length,
      unreadCount,
      byType,
      largestPosition: largest ? { symbol: largest.symbol, percent: largest.percent } : null,
      scores: rules.scores({ tradeCount, flaggedTrades: flagged.size, largestPercent: largest ? largest.percent : 0 }),
      events,
    };
  }

  router.get("/api/patterns", requireAuth, async (req, res, next) => {
    try {
      const { type, severity, acknowledged } = req.query;
      const filter = { userId: req.user.id };
      if (type !== undefined) {
        if (!TYPES.includes(type)) return res.status(400).json({ error: "Unknown pattern type" });
        filter.patternType = type;
      }
      if (severity !== undefined) {
        if (!SEVERITIES.includes(severity)) return res.status(400).json({ error: "Unknown severity" });
        filter.severity = severity;
      }
      if (acknowledged === "true" || acknowledged === "false") filter.acknowledged = acknowledged === "true";
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIMIT);
      const patterns = await BehaviorEvent.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
      res.json({ patterns });
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/patterns/summary", requireAuth, async (req, res, next) => {
    try {
      const { events, ...summary } = await buildSummary(req.user.id);
      res.json(summary);
    } catch (err) {
      next(err);
    }
  });

  router.patch("/api/patterns/:id/acknowledge", requireAuth, async (req, res, next) => {
    try {
      if (!isObjectId(req.params.id)) return notFound(res);
      const pattern = await BehaviorEvent.findOneAndUpdate(
        { _id: req.params.id, userId: req.user.id },
        { $set: { acknowledged: true } },
        { new: true }
      );
      if (!pattern) return notFound(res);
      res.json({ pattern });
    } catch (err) {
      next(err);
    }
  });

  // Mark everything read (e.g. after the user has looked at the page).
  router.post("/api/patterns/acknowledge-all", requireAuth, async (req, res, next) => {
    try {
      await BehaviorEvent.updateMany({ userId: req.user.id, acknowledged: false }, { $set: { acknowledged: true } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/api/patterns/:id", requireAuth, async (req, res, next) => {
    try {
      if (!isObjectId(req.params.id)) return notFound(res);
      const result = await BehaviorEvent.deleteOne({ _id: req.params.id, userId: req.user.id });
      if (!result || !result.deletedCount) return notFound(res);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  });

  // The last saved AI insight (null if none yet). Never fails the page when the AI service is down.
  router.get("/api/patterns/insight", requireAuth, async (req, res) => {
    try {
      const saved = await aiClient.behaviorInsight(req.user.id);
      res.json(saved && saved.insight ? saved : { insight: null });
    } catch (err) {
      res.json({ insight: null });
    }
  });

  // Ask the AI service for a coaching insight. All numbers are computed here; the AI only writes words.
  router.post("/api/patterns/analyze", requireAuth, async (req, res, next) => {
    try {
      const { events, ...summary } = await buildSummary(req.user.id);
      const payload = {
        scores: summary.scores,
        counts: summary.byType,
        largest_position: summary.largestPosition,
        events: events.slice(0, 20).map((e) => ({
          pattern_type: e.patternType, severity: e.severity, symbol: e.symbol, facts: e.facts || {},
          created_at: new Date(e.createdAt || Date.now()).toISOString(),
        })),
      };
      try {
        res.json(await aiClient.analyzeBehavior(req.user.id, payload));
      } catch (err) {
        console.warn("[patterns/analyze] AI service unavailable:", err.message);
        res.status(503).json({ error: "The AI coach is unavailable right now. Please try again in a minute." });
      }
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = patternRoutes;

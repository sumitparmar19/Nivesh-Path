// Behavioral Mirror API: the caller's detected patterns, a summary with behavioral scores, and an AI insight.
// Every route requires a JWT and only touches the caller's own events (filtered by req.user.id).
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../middleware/auth");
const rules = require("../lib/behaviorRules");

const TYPES = ["panic_sell", "fomo_buy", "overconcentration"];
const SEVERITIES = ["low", "medium", "high"];
const MAX_LIMIT = 100;

const isObjectId = (id) => mongoose.isValidObjectId(id);
const notFound = (res) => res.status(404).json({ error: "Pattern not found" });

/** A valid IANA time zone from the browser (e.g. "America/Los_Angeles"), or undefined. */
function timeZone(raw) {
  if (typeof raw !== "string" || raw.length > 64) return undefined;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return undefined;
  }
}

function patternRoutes({ BehaviorEvent, Purchase, ledger, aiClient, detector }) {
  const router = express.Router();

  // Each fresh analysis is a paid LLM call: at most 5 per hour per user (unchanged data is served for free).
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user.id,
    message: { error: "You've asked the AI coach 5 times this hour. Please try again later." },
  });

  // Counts, unread total, scores and a fingerprint of the data. Shared by GET /summary and POST /analyze.
  async function buildSummary(userId) {
    const [events, tradeCount, checkedTrades, portfolio] = await Promise.all([
      BehaviorEvent.find({ userId }).sort({ createdAt: -1 }).limit(500).lean(),
      Purchase.countDocuments({ userId }),
      Purchase.countDocuments({ userId, behaviorCheckedAt: { $exists: true } }),
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
    const scores = { ...rules.scores({ checkedTrades, flaggedTrades: flagged.size, largestPercent: largest ? largest.percent : 0 }), tradeCount };
    // Changes whenever an event is added, re-graded or removed, or the scores move: used to tell whether the
    // saved AI insight still matches the data (and to skip a paid call when nothing changed).
    const fingerprint = crypto
      .createHash("sha1")
      .update(JSON.stringify([events.map((e) => `${e._id}:${e.severity}`).sort(), scores]))
      .digest("hex");
    return {
      totalPatterns: events.length,
      unreadCount,
      byType,
      largestPosition: largest ? { symbol: largest.symbol, percent: largest.percent } : null,
      scores,
      fingerprint,
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

      // Add the trade's time and size so two similar cards can be told apart (only the caller's own trades).
      const tradeIds = [...new Set(patterns.filter((p) => p.tradeId).map((p) => String(p.tradeId)))];
      const trades = tradeIds.length ? await Purchase.find({ userId: req.user.id, _id: { $in: tradeIds } }).lean() : [];
      const byId = Object.fromEntries(trades.map((t) => [String(t._id), t]));
      res.json({
        patterns: patterns.map((p) => {
          const t = p.tradeId && byId[String(p.tradeId)];
          return { ...p, trade: t ? { quantity: t.quantity, timestamp: t.timestamp, side: t.transactionType } : null };
        }),
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/patterns/summary", requireAuth, async (req, res, next) => {
    try {
      // A stock can cross 35% (or fall back) through price moves alone: re-check at most every 15 minutes.
      if (detector && detector.checkPrices) await detector.checkPrices(req.user.id);
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

  async function savedInsight(userId) {
    try {
      const saved = await aiClient.behaviorInsight(userId);
      return saved && saved.insight ? saved : null;
    } catch {
      return null;
    }
  }

  // The last saved AI insight (null if none yet), with `stale: true` when the patterns or scores changed
  // since it was written. Never fails the page when the AI service is down.
  router.get("/api/patterns/insight", requireAuth, async (req, res, next) => {
    try {
      const saved = await savedInsight(req.user.id);
      if (!saved) return res.json({ insight: null });
      const { fingerprint } = await buildSummary(req.user.id);
      res.json({ ...saved, stale: saved.fingerprint !== fingerprint });
    } catch (err) {
      next(err);
    }
  });

  // Nothing changed since the saved insight -> return it without a paid call (and without using the limit).
  async function unchangedShortcut(req, res, next) {
    try {
      const summary = await buildSummary(req.user.id);
      req.behaviorSummary = summary;
      const saved = await savedInsight(req.user.id);
      if (saved && saved.fingerprint === summary.fingerprint) return res.json({ ...saved, stale: false, reused: true });
      return next();
    } catch (err) {
      return next(err);
    }
  }

  // Ask the AI service for a coaching insight. All numbers are computed here; the AI only writes words.
  router.post("/api/patterns/analyze", requireAuth, unchangedShortcut, limiter, async (req, res, next) => {
    try {
      const { events, fingerprint, ...summary } = req.behaviorSummary;
      const payload = {
        scores: summary.scores,
        counts: summary.byType,
        largest_position: summary.largestPosition,
        fingerprint,
        timezone: timeZone((req.body || {}).timezone),
        events: events.slice(0, 20).map((e) => ({
          pattern_type: e.patternType, severity: e.severity, symbol: e.symbol, facts: e.facts || {},
          created_at: new Date(e.createdAt || Date.now()).toISOString(),
        })),
      };
      try {
        res.json({ ...(await aiClient.analyzeBehavior(req.user.id, payload)), stale: false });
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
module.exports.timeZone = timeZone;

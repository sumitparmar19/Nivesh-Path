// Service-to-service API for the AI service: read-only access to trades in the ledger, so its ChromaDB rebuild
// reads from whichever store holds the money (MongoDB or Postgres) instead of the `purchases` collection directly.
// The web component is public, so these routes only exist when AI_INTERNAL_TOKEN is set, and every request must
// carry it in X-Internal-Token (compared in constant time). Anything else under /internal is a plain JSON 404,
// so the routes can't be told apart from missing ones.
// DEMO_FAULTS=1 (set only in the AWS demo stack, infra/demo) adds GET /internal/demo-fault, which answers 500 on
// purpose so the CloudWatch 5xx alarm can be tested once; it is behind the same token as everything else here.
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");

const OBJECT_ID_RE = /^[0-9a-f]{24}$/;

/** Constant-time comparison of two strings (hashing first makes the lengths equal). */
function tokensMatch(sent, expected) {
  const a = crypto.createHash("sha256").update(String(sent)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

/** A ledger trade in the shape the AI service's Transaction model expects. */
function toAiTrade(t) {
  return {
    id: String(t._id),
    symbol: String(t.name || "").toUpperCase(),
    quantity: Number(t.quantity),
    price: Number(t.price),
    transaction_type: t.transactionType === "sell" ? "sell" : "buy",
    timestamp: t.timestamp,
  };
}

function internalRoutes({ ledgerStore, token, demoFaults = false }) {
  const router = express.Router();
  const notFound = (req, res) => res.status(404).json({ error: "Not found" });

  // The boot rebuild makes one call per user; this only slows down someone guessing the token.
  const limiter = rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false });

  function requireToken(req, res, next) {
    const sent = req.get("X-Internal-Token");
    if (!token || !sent || !tokensMatch(sent, token)) return notFound(req, res);
    return next();
  }

  router.use("/internal", limiter, requireToken);

  router.get("/internal/trades/users", async (req, res, next) => {
    try {
      res.json({ users: await ledgerStore.usersWithTrades() });
    } catch (err) {
      next(err);
    }
  });

  router.get("/internal/trades", async (req, res, next) => {
    try {
      const userId = String(req.query.userId || "");
      if (!OBJECT_ID_RE.test(userId)) return res.status(400).json({ error: "userId must be a 24-character hex id" });
      const trades = await ledgerStore.listTrades(userId, { order: "asc" });
      return res.json({ userId, trades: trades.map(toAiTrade) });
    } catch (err) {
      return next(err);
    }
  });

  if (demoFaults) {
    router.get("/internal/demo-fault", (req, res) => {
      res.status(500).json({ error: "Deliberate error for the alarm test (DEMO_FAULTS=1)." });
    });
  }

  router.use("/internal", notFound);
  return router;
}

module.exports = { internalRoutes, tokensMatch, toAiTrade };

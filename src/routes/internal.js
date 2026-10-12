// Service-to-service API for the AI service: read-only access to trades in the ledger, so its ChromaDB rebuild
// reads from whichever store holds the money (MongoDB or Postgres) instead of the `purchases` collection directly.
// The web component is public, so these routes only exist when AI_INTERNAL_TOKEN is set, and every request must
// carry it in X-Internal-Token (compared in constant time). Anything else under /internal is a plain JSON 404,
// so the routes can't be told apart from missing ones.
// DEMO_FAULTS=1 (set only in the AWS demo stack, infra/demo) adds GET /internal/demo-fault, which answers 500 on
// purpose so the CloudWatch 5xx alarm can be tested once; it is behind the same token as everything else here.
// /internal/jobs/* (PR F) is the nightly job's whole interface, so AWS needs no database credentials: list held
// tickers (read), save one stock's daily close (writes only `price_snapshots`), and run the concentration check
// for every user (writes only Behavioral Mirror events, exactly as after a trade). Reviewed in the PR B review, Q1.
const crypto = require("crypto");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { closeFromQuote } = require("../lib/priceSnapshots");

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

const SYMBOL_RE = /^[A-Z.]{1,10}$/;

function internalRoutes({ ledgerStore, token, demoFaults = false, jobs = null }) {
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

  if (jobs) {
    const { ledger, quotes, snapshots, detector, now = () => Date.now(), log = console } = jobs;

    router.get("/internal/jobs/held-tickers", async (req, res, next) => {
      try {
        res.json({ symbols: await ledger.heldSymbols() });
      } catch (err) {
        next(err);
      }
    });

    // One stock per call, so the job's Map step can pace Finnhub (60 calls/minute) and retry a single stock.
    router.post("/internal/jobs/snapshots/:symbol", async (req, res, next) => {
      try {
        const symbol = String(req.params.symbol || "").toUpperCase();
        if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: "symbol must be a ticker like AAPL" });
        if (!snapshots) return res.status(503).json({ error: "Daily price snapshots need the Postgres ledger (DATABASE_URL)." });
        let quote;
        try {
          quote = await quotes.getQuote(symbol);
        } catch (err) {
          // 502/503: the job retries this stock with backoff; a bad symbol (400) is not retried.
          return res.status(err.status === 400 ? 400 : 502).json({ error: `Quote unavailable for ${symbol}: ${err.message}` });
        }
        const close = closeFromQuote(quote, now());
        if (close.skip) return res.json({ symbol, saved: false, skipped: close.skip });
        const { created } = await snapshots.save({ symbol, ...close });
        log.info(`[jobs] snapshot ${symbol} ${close.tradingDate} ${close.close} (${created ? "new" : "updated"})`);
        return res.json({ symbol, saved: true, created, tradingDate: close.tradingDate, close: close.close });
      } catch (err) {
        return next(err);
      }
    });

    router.post("/internal/jobs/concentration-check", async (req, res, next) => {
      try {
        res.json(await detector.checkAllUsers());
      } catch (err) {
        next(err);
      }
    });
  }

  if (demoFaults) {
    router.get("/internal/demo-fault", (req, res) => {
      res.status(500).json({ error: "Deliberate error for the alarm test (DEMO_FAULTS=1)." });
    });
  }

  router.use("/internal", notFound);
  return router;
}

module.exports = { internalRoutes, tokensMatch, toAiTrade };

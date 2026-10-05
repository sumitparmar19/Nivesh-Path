// Per-user watchlist: the stocks a user is following, stored in MongoDB so the star syncs across devices.
const express = require("express");
const { requireAuth } = require("../middleware/auth");

const SYMBOL_RE = /^[A-Z][A-Z.]{0,9}$/;
const MAX_ITEMS = 100;

function watchlistRoutes({ Watchlist }) {
  const router = express.Router();
  const view = (w) => ({ symbol: w.symbol, addedAt: w.addedAt });

  router.get("/api/watchlist", requireAuth, async (req, res, next) => {
    try {
      const rows = await Watchlist.find({ userId: req.user.id }).sort({ addedAt: -1 }).lean();
      return res.json(rows.map(view));
    } catch (err) {
      return next(err);
    }
  });

  router.post("/api/watchlist", requireAuth, async (req, res, next) => {
    try {
      const symbol = String((req.body || {}).symbol || "").trim().toUpperCase();
      if (!SYMBOL_RE.test(symbol)) return res.status(400).json({ error: "Invalid stock symbol" });
      const existing = await Watchlist.findOne({ userId: req.user.id, symbol });
      if (existing) return res.status(200).json(view(existing));
      if ((await Watchlist.countDocuments({ userId: req.user.id })) >= MAX_ITEMS) {
        return res.status(400).json({ error: `Your watchlist can hold up to ${MAX_ITEMS} stocks` });
      }
      const row = await Watchlist.create({ userId: req.user.id, symbol });
      return res.status(201).json(view(row));
    } catch (err) {
      if (err.code === 11000) return res.status(200).json({ symbol: String(req.body.symbol).toUpperCase() });
      return next(err);
    }
  });

  router.delete("/api/watchlist/:symbol", requireAuth, async (req, res, next) => {
    try {
      const symbol = String(req.params.symbol || "").toUpperCase();
      const result = await Watchlist.deleteOne({ userId: req.user.id, symbol });
      return res.json({ removed: Boolean(result && result.deletedCount) });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = watchlistRoutes;

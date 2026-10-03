// Market data routes: cached Finnhub quotes, proxied through the server.
const express = require("express");
const { STOCKS } = require("../config");

function stockRoutes({ quotes }) {
  const router = express.Router();

  // Dashboard: quotes for every tracked symbol (or ?symbol=XYZ for one).
  router.get("/search", async (req, res, next) => {
    try {
      if (req.query.symbol) {
        const symbol = String(req.query.symbol).toUpperCase();
        return res.json({ [symbol]: await quotes.getQuote(symbol) });
      }
      const data = await quotes.getQuotes(Object.keys(STOCKS));
      if (Object.keys(data).length === 0) {
        return res.status(502).json({ error: "Failed to fetch stock prices" });
      }
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get("/stock/:symbol", async (req, res, next) => {
    try {
      res.json(await quotes.getQuote(req.params.symbol));
    } catch (err) {
      next(err);
    }
  });

  router.get("/stock", async (req, res, next) => {
    try {
      res.json(await quotes.getQuote(req.query.symbol || "AAPL"));
    } catch (err) {
      next(err);
    }
  });

  router.get("/api/stocks", (req, res) => {
    res.json(Object.entries(STOCKS).map(([symbol, name]) => ({ symbol, name })));
  });

  // Kept for the existing company pages: they used to call Finnhub directly with this key.
  // The key is no longer exposed; quotes go through /stock/:symbol instead.
  router.get("/api/get-api-key", (req, res) => {
    res.json({ apiKey: "proxied" });
  });

  return router;
}

module.exports = stockRoutes;

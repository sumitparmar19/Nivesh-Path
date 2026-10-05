// Market data routes: cached Finnhub data (quotes, profile, key stats, news, search), proxied through the
// server so the API key never reaches the browser. Public: no login needed to look at a stock.
const express = require("express");
const { STOCKS } = require("../config");

function stockRoutes({ quotes, marketData }) {
  const router = express.Router();
  const handle = (fn) => async (req, res, next) => {
    try {
      res.json(await fn(req));
    } catch (err) {
      next(err);
    }
  };

  router.get("/api/stocks/curated", handle(() => marketData.curated()));
  router.get("/api/stocks/search", handle((req) => marketData.search(req.query.q)));
  router.get("/api/stocks/quotes", handle((req) => marketData.quoteMany(req.query.symbols)));
  router.get("/api/stocks/:symbol/quote", handle((req) => marketData.quote(req.params.symbol)));
  router.get("/api/stocks/:symbol/profile", handle((req) => marketData.profile(req.params.symbol)));
  router.get("/api/stocks/:symbol/metrics", handle((req) => marketData.metrics(req.params.symbol)));
  router.get("/api/stocks/:symbol/news", handle((req) => marketData.news(req.params.symbol)));
  router.get("/api/stocks/:symbol/candles", handle((req) => marketData.candles(req.params.symbol, req.query.days)));

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

  router.get("/api/stocks", (req, res) => {
    res.json(Object.entries(STOCKS).map(([symbol, name]) => ({ symbol, name })));
  });

  return router;
}

module.exports = stockRoutes;

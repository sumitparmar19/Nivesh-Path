// Builds the Express app. Dependencies are injectable so tests can run without Mongo/Finnhub/the AI service.
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mongoose = require("mongoose");

const { config } = require("./config");
const { createCache } = require("./lib/cache");
const { createQuoteService } = require("./lib/quotes");
const { createAiClient } = require("./lib/aiClient");
const stockRoutes = require("./routes/stocks");
const purchaseRoutes = require("./routes/purchases");
const { authRoutes } = require("./routes/auth");
const { optionalAuth } = require("./middleware/auth");
const aiRoutes = require("./routes/ai");
const { accountRoutes } = require("./routes/account");
const watchlistRoutes = require("./routes/watchlist");
const contactRoutes = require("./routes/contact");
const { createMailer } = require("./lib/mailer");

const LEGACY_PAGES = {
  "/index.html": "/AAPL.html",
  "/Nvidia.html": "/NVDA.html",
  "/Tesla.html": "/TSLA.html",
  "/Microsoft.html": "/MSFT.html",
  "/Amazone.html": "/AMZN.html",
  "/Walmart.html": "/WMT.html",
  "/Nike.html": "/NKE.html",
  "/Uber.html": "/UBER.html",
  "/Starbucks.html": "/SBUX.html",
  "/Netflix.html": "/NFLX.html",
  "/Goldman.html": "/GS.html",
  "/Oracle.html": "/ORCL.html",
  "/dashboard1.html": "/portfolio.html",
  "/success.html": "/portfolio.html",
  "/cancel.html": "/portfolio.html",
  "/demo.html": "/search.html",
  "/psk/pages/products.html": "/psk/pages/about.html",
  "/psk/pages/pricing.html": "/psk/pages/about.html#faq",
  "/psk/pages/support.html": "/psk/pages/contect.html",
};

function createApp(deps = {}) {
  const Purchase = deps.Purchase || require("../models/Stock1");
  const User = deps.User || require("./models/User");
  const quotes = deps.quotes || createQuoteService({ cache: deps.cache || createCache() });
  const aiClient = deps.aiClient || createAiClient();
  const Analysis = deps.Analysis || require("./models/Analysis");
  const Watchlist = deps.Watchlist || require("./models/Watchlist");
  const Message = deps.Message || require("./models/Message");
  const mailer = deps.mailer || createMailer();

  const app = express();
  app.disable("x-powered-by");
  // CSP is off because the existing pages load scripts/styles from several CDNs inline.
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      ai: Boolean(config.aiServiceUrl),
    });
  });

  // Public status for the "What's new" page: is each part of the stack up? (no user data)
  app.get("/api/status", async (req, res) => {
    let ai = { reachable: false };
    try {
      const h = await aiClient.health();
      ai = { reachable: true, llmConfigured: Boolean(h.llm_configured), model: h.model || null, vectorIndex: null };
      if (h.vector_index) {
        const { status, users, transactions, seconds } = h.vector_index;
        ai.vectorIndex = { status, users, transactions, seconds };
      }
    } catch (err) {
      // AI service unreachable: report it rather than failing the page
    }
    res.json({
      web: "ok",
      db: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
      ai,
      checkedAt: new Date().toISOString(),
    });
  });

  app.use(optionalAuth);
  app.use(stockRoutes({ quotes }));
  app.use(purchaseRoutes({ Purchase, User, quotes, aiClient }));
  app.use(authRoutes({ User }));
  app.use(accountRoutes({ User, Purchase, Watchlist, Analysis, aiClient }));
  app.use(watchlistRoutes({ Watchlist }));
  app.use(contactRoutes({ Message, mailer, contactTo: deps.contactTo }));
  app.use(aiRoutes({ Purchase, Analysis, quotes, aiClient }));

  // Old page URLs (company-name pages, removed marketing pages) keep working via permanent redirects.
  app.get("/", (req, res) => res.redirect(302, "/psk/index.html"));
  app.get(Object.keys(LEGACY_PAGES), (req, res) => res.redirect(301, LEGACY_PAGES[req.path]));

  app.use(express.static(path.join(__dirname, "..", "public"), { index: false, dotfiles: "deny" }));

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    if (deps.onError) deps.onError(err);
    res.status(status).json({ error: status >= 500 && !err.status ? "Internal server error" : err.message });
  });

  return app;
}

module.exports = { createApp };

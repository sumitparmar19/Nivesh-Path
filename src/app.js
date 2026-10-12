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
const patternRoutes = require("./routes/patterns");
const { internalRoutes } = require("./routes/internal");
const { createLedger } = require("./lib/ledger");
const { createLedgerStore } = require("./lib/ledgerStore");
const { createBehaviorDetector } = require("./lib/behaviorDetector");
const { createMailer } = require("./lib/mailer");
const { createMarketData } = require("./lib/marketData");
const { mountSpa, mountSpaNotFound } = require("./spa");
const { fakeFetch, FAKE_API_KEY } = require("./lib/fakeMarket");
const { logger, requestLog } = require("./lib/logger");
const { httpMetrics, routeOf } = require("./lib/metrics");

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
  const cache = deps.cache || createCache();
  // FAKE_MARKET_DATA=1 (browser tests only, refused in production by server.js): made-up prices, no Finnhub key.
  const fake = deps.fakeMarket ?? process.env.FAKE_MARKET_DATA === "1";
  const market = fake ? { fetchImpl: fakeFetch, apiKey: FAKE_API_KEY } : { fetchImpl: deps.fetchImpl };
  const quotes = deps.quotes || createQuoteService({ cache, ...market });
  const marketData = deps.marketData || createMarketData({ cache, quotes, ...market });
  const aiClient = deps.aiClient || createAiClient();
  const Analysis = deps.Analysis || require("./models/Analysis");
  const Watchlist = deps.Watchlist || require("./models/Watchlist");
  const Message = deps.Message || require("./models/Message");
  const mailer = deps.mailer || createMailer();
  const BehaviorEvent = deps.BehaviorEvent || require("./models/BehaviorEvent");
  // One ledger for the whole app: MongoDB or Postgres (LEDGER_BACKEND); LEDGER_MAINTENANCE=1 pauses trading.
  const ledgerStore = deps.ledgerStore || createLedgerStore({ backend: deps.ledgerBackend || config.ledgerBackend, User, Purchase });
  const maintenance = () => (deps.ledgerMaintenance !== undefined ? Boolean(deps.ledgerMaintenance) : process.env.LEDGER_MAINTENANCE === "1");
  const ledger = createLedger({ store: ledgerStore, quotes, maintenance });
  const detector = deps.detector === undefined ? createBehaviorDetector({ BehaviorEvent, ledgerStore, marketData, ledger }) : deps.detector;
  const internalToken = deps.internalToken !== undefined ? deps.internalToken : config.aiInternalToken;

  const app = express();
  app.disable("x-powered-by");
  // Request duration by route template (metrics) and one JSON log line per API request. Both no-ops in tests.
  app.use(httpMetrics);
  app.use(requestLog(routeOf));
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
      // Which store holds the money (no database call: this endpoint is polled, and Neon sleeps when idle).
      ledger: { backend: ledgerStore.kind, tradingPaused: maintenance() },
      // Set only by the AWS demo stack (infra/demo), so What's new can say the visitor isn't on the live site.
      platform: process.env.DEPLOY_PLATFORM || null,
      checkedAt: new Date().toISOString(),
    });
  });

  // Service-to-service (AI service -> web): token-only, never a user JWT; 404 unless AI_INTERNAL_TOKEN is set.
  const demoFaults = deps.demoFaults !== undefined ? Boolean(deps.demoFaults) : process.env.DEMO_FAULTS === "1"; // AWS demo only
  app.use(internalRoutes({ ledgerStore, token: internalToken, demoFaults }));

  app.use(optionalAuth);
  app.use(stockRoutes({ quotes, marketData }));
  app.use(purchaseRoutes({ ledger, aiClient, BehaviorEvent, detector }));
  app.use(authRoutes({ User, ledgerStore }));
  app.use(accountRoutes({ User, ledger, Watchlist, Analysis, BehaviorEvent, aiClient }));
  app.use(watchlistRoutes({ Watchlist }));
  app.use(contactRoutes({ Message, mailer, contactTo: deps.contactTo }));
  app.use(aiRoutes({ ledger, Analysis, quotes, aiClient }));
  app.use(patternRoutes({ BehaviorEvent, ledger, aiClient, detector }));

  // React app (frontend/dist): enabled routes take over, and the legacy URLs they replace redirect to them.
  app.locals.reactRoutes = mountSpa(app, deps.spa || {});
  app.locals.ledgerStore = ledgerStore;
  app.locals.aiClient = aiClient;

  // Old page URLs (company-name pages, removed marketing pages) keep working via permanent redirects.
  app.get("/", (req, res) => res.redirect(302, "/psk/index.html"));
  app.get(Object.keys(LEGACY_PAGES), (req, res) => res.redirect(301, LEGACY_PAGES[req.path]));

  app.use(express.static(path.join(__dirname, "..", "public"), { index: false, dotfiles: "deny" }));
  if (app.locals.reactRoutes.length) mountSpaNotFound(app, deps.spa || {});

  app.use("/api", (req, res) => res.status(404).json({ error: "Not found" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || 500;
    if (status >= 500) logger.error({ err }, "unhandled error");
    if (deps.onError) deps.onError(err);
    res.status(status).json({ error: status >= 500 && !err.status ? "Internal server error" : err.message });
  });

  return app;
}

module.exports = { createApp };

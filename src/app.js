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

function createApp(deps = {}) {
  const Purchase = deps.Purchase || require("../models/Stock1");
  const User = deps.User || require("./models/User");
  const quotes = deps.quotes || createQuoteService({ cache: deps.cache || createCache() });
  const aiClient = deps.aiClient || createAiClient();

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

  app.use(optionalAuth);
  app.use(stockRoutes({ quotes }));
  app.use(purchaseRoutes({ Purchase, User, quotes, aiClient }));
  app.use(authRoutes({ User }));
  app.use(aiRoutes({ Purchase, quotes, aiClient }));

  app.use(express.static(path.join(__dirname, "..", "public")));

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

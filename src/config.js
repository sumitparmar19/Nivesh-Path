// Central place for environment-driven configuration of the Node backend.
require("dotenv").config();

const config = {
  port: Number(process.env.PORT) || 3000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),
  mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URI || "",
  finnhubApiKey: process.env.FINNHUB_API_KEY || "",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret",
  redisUrl: process.env.REDIS_URL || "",
  aiServiceUrl: (process.env.AI_SERVICE_URL || "http://localhost:8001").replace(/\/$/, ""),
  sentryDsn: process.env.SENTRY_DSN || "",
  quoteCacheSeconds: Number(process.env.QUOTE_CACHE_SECONDS) || 60,
};

// Symbols shown on the dashboard, with display names used for Stripe checkout.
const STOCKS = {
  AAPL: "Apple Inc.",
  NVDA: "NVIDIA Corporation",
  TSLA: "Tesla, Inc.",
  MSFT: "Microsoft Corporation",
  AMZN: "Amazon.com, Inc.",
  WMT: "Walmart Inc.",
  NKE: "NIKE, Inc.",
  UBER: "Uber Technologies, Inc.",
  SBUX: "Starbucks Corporation",
  NFLX: "Netflix, Inc.",
  GS: "The Goldman Sachs Group, Inc.",
  ORCL: "Oracle Corporation",
};

// Legacy per-company checkout routes (/create-checkout-session-<slug>) used by the existing pages.
const CHECKOUT_SLUGS = {
  nvidia: "NVDA",
  tesla: "TSLA",
  microsoft: "MSFT",
  amazone: "AMZN",
  walmart: "WMT",
  nike: "NKE",
  uber: "UBER",
  starbucks: "SBUX",
  netflix: "NFLX",
  goldman: "GS",
  oracle: "ORCL",
};

module.exports = { config, STOCKS, CHECKOUT_SLUGS };

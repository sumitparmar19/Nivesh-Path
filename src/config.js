// Central place for environment-driven configuration of the Node backend.
require("dotenv").config();

const config = {
  port: Number(process.env.PORT) || 3000,
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),
  mongoUrl: process.env.MONGO_URL || process.env.MONGODB_URI || "",
  finnhubApiKey: process.env.FINNHUB_API_KEY || "",
  jwtSecret: process.env.JWT_SECRET || "dev-only-insecure-secret",
  redisUrl: process.env.REDIS_URL || "",
  aiServiceUrl: (process.env.AI_SERVICE_URL || "http://localhost:8001").replace(/\/$/, ""),
  sentryDsn: process.env.SENTRY_DSN || "",
  // Optional email (contact form) via Resend
  resendApiKey: process.env.RESEND_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "Nivesh-Path <onboarding@resend.dev>",
  contactToEmail: process.env.CONTACT_TO_EMAIL || "",
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

// Older pages stored company names instead of tickers; map them so holdings and quotes still work.
const NAME_TO_SYMBOL = {
  APPLE: "AAPL",
  NVIDIA: "NVDA",
  TESLA: "TSLA",
  MICROSOFT: "MSFT",
  AMAZON: "AMZN",
  AMAZONE: "AMZN",
  WALMART: "WMT",
  NIKE: "NKE",
  UBER: "UBER",
  STARBUCKS: "SBUX",
  NETFLIX: "NFLX",
  "GOLDMAN SACHS": "GS",
  GOLDMAN: "GS",
  ORACLE: "ORCL",
};

function toSymbol(name) {
  const key = String(name || "").trim().toUpperCase();
  return NAME_TO_SYMBOL[key] || key;
}

module.exports = { config, STOCKS, toSymbol };

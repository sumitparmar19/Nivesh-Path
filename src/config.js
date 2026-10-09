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
  // Optional shared secret sent to the AI service (it rejects calls without it when set there too).
  aiInternalToken: process.env.AI_INTERNAL_TOKEN || "",
  sentryDsn: process.env.SENTRY_DSN || "",
  // Optional email (contact form) via Resend
  resendApiKey: process.env.RESEND_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "Nivesh-Path <onboarding@resend.dev>",
  contactToEmail: process.env.CONTACT_TO_EMAIL || "",
  quoteCacheSeconds: Number(process.env.QUOTE_CACHE_SECONDS) || 60,
};

// The 12 stocks with their own page (/<TICKER>.html); used for dashboard quotes.
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

// Curated stocks and ETFs shown on Markets, by sector. Any other NYSE/NASDAQ ticker works through search.
const CURATED = [
  { category: "Big Tech", stocks: [["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"], ["META", "Meta Platforms"], ["TSLA", "Tesla"], ["AMD", "AMD"], ["ORCL", "Oracle"], ["INTC", "Intel"], ["CRM", "Salesforce"]] },
  { category: "Finance", stocks: [["JPM", "JPMorgan Chase"], ["GS", "Goldman Sachs"], ["BAC", "Bank of America"], ["MS", "Morgan Stanley"], ["V", "Visa"], ["MA", "Mastercard"], ["PYPL", "PayPal"]] },
  { category: "Retail & Consumer", stocks: [["WMT", "Walmart"], ["COST", "Costco"], ["TGT", "Target"], ["HD", "Home Depot"], ["NKE", "Nike"], ["SBUX", "Starbucks"], ["MCD", "McDonald's"], ["KO", "Coca-Cola"], ["PEP", "PepsiCo"]] },
  { category: "Media & Entertainment", stocks: [["NFLX", "Netflix"], ["DIS", "Disney"], ["SPOT", "Spotify"], ["RBLX", "Roblox"], ["EA", "Electronic Arts"]] },
  { category: "Transport", stocks: [["UBER", "Uber"], ["LYFT", "Lyft"], ["FDX", "FedEx"], ["UPS", "UPS"], ["F", "Ford"]] },
  { category: "Healthcare", stocks: [["JNJ", "Johnson & Johnson"], ["PFE", "Pfizer"], ["UNH", "UnitedHealth"], ["ABBV", "AbbVie"], ["LLY", "Eli Lilly"]] },
  { category: "Energy", stocks: [["XOM", "Exxon Mobil"], ["CVX", "Chevron"], ["COP", "ConocoPhillips"]] },
  { category: "ETFs", stocks: [["SPY", "SPDR S&P 500 ETF"], ["QQQ", "Invesco QQQ (Nasdaq-100)"], ["VTI", "Vanguard Total Stock Market ETF"], ["IWM", "iShares Russell 2000 ETF"], ["DIA", "SPDR Dow Jones ETF"]] },
].map((c) => ({ category: c.category, stocks: c.stocks.map(([symbol, name]) => ({ symbol, name })) }));

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

module.exports = { config, STOCKS, CURATED, toSymbol };

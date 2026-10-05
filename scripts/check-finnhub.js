// Checks which Finnhub endpoints your FINNHUB_API_KEY can use (quote, profile, key stats, news, search and
// daily candles for price history). Run: `node scripts/check-finnhub.js` (reads .env). Prints no secrets.
require("dotenv").config();

const key = process.env.FINNHUB_API_KEY;
if (!key) {
  console.error("FINNHUB_API_KEY is not set (add it to .env).");
  process.exit(1);
}
const now = Math.floor(Date.now() / 1000);
const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const checks = [
  ["Quote", "/quote", { symbol: "AAPL" }],
  ["Company profile", "/stock/profile2", { symbol: "AAPL" }],
  ["Key stats (basic financials)", "/stock/metric", { symbol: "AAPL", metric: "all" }],
  ["Company news", "/company-news", { symbol: "AAPL", from: day(7), to: day(0) }],
  ["Symbol search", "/search", { q: "apple", exchange: "US" }],
  ["Daily candles (price history)", "/stock/candle", { symbol: "AAPL", resolution: "D", from: String(now - 30 * 86400), to: String(now) }],
];

(async () => {
  for (const [label, path, params] of checks) {
    const qs = new URLSearchParams({ ...params, token: key });
    try {
      const res = await fetch(`https://finnhub.io/api/v1${path}?${qs}`);
      const body = await res.json().catch(() => ({}));
      const ok = res.ok && !(body && body.error) && !(path === "/stock/candle" && body.s !== "ok");
      console.log(`${ok ? "OK  " : "NO  "} ${label}${ok ? "" : ` (HTTP ${res.status}${body && body.error ? `: ${body.error}` : ""})`}`);
    } catch (err) {
      console.log(`ERR  ${label}: ${err.message}`);
    }
  }
  console.log("\nIf daily candles show NO, stock pages keep the embedded TradingView chart (already in place).");
})();

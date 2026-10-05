// Made-up, deterministic market data for automated browser tests (FAKE_MARKET_DATA=1), so CI can run the
// full app without a Finnhub key. It answers the same Finnhub URLs the real services call. server.js refuses
// to start with it in production, so real users never see these prices.
const NAMES = {
  AAPL: "Apple Inc", MSFT: "Microsoft Corp", NVDA: "NVIDIA Corp", TSLA: "Tesla Inc", AMZN: "Amazon.com Inc",
  WMT: "Walmart Inc", NKE: "Nike Inc", UBER: "Uber Technologies Inc", SBUX: "Starbucks Corp", NFLX: "Netflix Inc",
  GS: "Goldman Sachs Group Inc", ORCL: "Oracle Corp", SPY: "SPDR S&P 500 ETF Trust", QQQ: "Invesco QQQ Trust",
};

// Same symbol -> same numbers on every run, so tests can rely on them.
function seed(symbol) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return h;
}

function fakeQuote(symbol) {
  const s = seed(symbol);
  const pc = 50 + (s % 450);
  const dp = ((s % 41) - 20) / 10; // -2.0% .. +2.0%
  const c = Math.round(pc * (1 + dp / 100) * 100) / 100;
  return { c, d: Math.round((c - pc) * 100) / 100, dp, o: pc, h: Math.max(c, pc) + 1, l: Math.min(c, pc) - 1, pc, t: Math.floor(Date.now() / 1000) };
}

function body(url) {
  const u = new URL(url);
  const symbol = String(u.searchParams.get("symbol") || "").toUpperCase();
  switch (u.pathname.replace("/api/v1", "")) {
    case "/quote":
      return fakeQuote(symbol);
    case "/stock/profile2":
      return NAMES[symbol]
        ? { name: NAMES[symbol], finnhubIndustry: "Technology", exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD", ipo: "1990-01-01", marketCapitalization: 100000 + seed(symbol) * 10, weburl: "" }
        : {};
    case "/stock/metric": {
      const q = fakeQuote(symbol);
      return { metric: { marketCapitalization: 100000, peTTM: 25, epsTTM: 4, "52WeekHigh": q.c * 1.2, "52WeekLow": q.c * 0.8, beta: 1.1, currentDividendYieldTTM: 0.5, "10DayAverageTradingVolume": 20 } };
    }
    case "/company-news":
      return [];
    case "/search": {
      const q = String(u.searchParams.get("q") || "").toUpperCase();
      return {
        result: Object.entries(NAMES)
          .filter(([sym, name]) => sym.startsWith(q) || name.toUpperCase().includes(q))
          .map(([sym, name]) => ({ symbol: sym, description: name.toUpperCase(), type: "Common Stock" })),
      };
    }
    case "/stock/candle": {
      const q = fakeQuote(symbol);
      const to = Number(u.searchParams.get("to")) || Math.floor(Date.now() / 1000);
      const t = Array.from({ length: 60 }, (_, i) => to - (59 - i) * 86400);
      return { s: "ok", t, c: t.map((_, i) => Math.round(q.c * (0.9 + (i / 59) * 0.1) * 100) / 100) };
    }
    default:
      return {};
  }
}

/** A drop-in replacement for fetch() that answers Finnhub URLs with made-up data. */
async function fakeFetch(url) {
  const data = body(url);
  return { ok: true, status: 200, json: async () => data };
}

const FAKE_API_KEY = "fake-market-data";

module.exports = { fakeFetch, fakeQuote, FAKE_API_KEY };

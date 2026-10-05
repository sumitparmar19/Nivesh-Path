// Market data for stock pages and Markets: normalised quotes, company profile, key stats, news, symbol search
// and (if the Finnhub plan allows) daily candles. All calls go through the server with caching
// (quotes 60s, profiles 24h, metrics/news/search 1h) so the API key stays private and rate limits hold.
const { config, CURATED } = require("../config");

const SYMBOL_RE = /^[A-Z][A-Z.]{0,9}$/;
const US_TICKER_RE = /^[A-Z]{1,5}(\.[A-Z])?$/; // AAPL, BRK.B; not foreign listings like XOM.SW
const TTL = { profile: 24 * 3600, metrics: 3600, news: 3600, search: 3600, candles: 3600 };
const CURATED_NAMES = Object.fromEntries(CURATED.flatMap((c) => c.stocks.map((s) => [s.symbol, s.name])));

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeSymbol(raw) {
  const symbol = String(raw || "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw httpError(400, "Invalid stock symbol");
  return symbol;
}

const isoDate = (d) => d.toISOString().slice(0, 10);
const numOrNull = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

function createMarketData({ cache, quotes, fetchImpl = fetch, apiKey = config.finnhubApiKey }) {
  async function finnhub(path, params) {
    if (!apiKey) throw httpError(503, "Market data is not configured");
    const qs = new URLSearchParams({ ...params, token: apiKey }).toString();
    let res;
    try {
      res = await fetchImpl(`https://finnhub.io/api/v1${path}?${qs}`, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      throw httpError(502, "Market data provider is unreachable");
    }
    if (res.status === 429) throw httpError(503, "Market data is busy right now. Please try again in a minute.");
    if (res.status === 401 || res.status === 403) throw httpError(502, "This data is not available on the current market data plan");
    if (!res.ok) throw httpError(502, `Market data provider returned ${res.status}`);
    return res.json();
  }

  async function cached(key, ttl, load) {
    const hit = await cache.get(key);
    if (hit) return hit;
    const value = await load();
    await cache.set(key, value, ttl);
    return value;
  }

  async function quote(raw) {
    const symbol = normalizeSymbol(raw);
    const q = await quotes.getQuote(symbol);
    if (!q || !(q.c > 0)) throw httpError(404, `No price found for ${symbol}`);
    return {
      symbol,
      price: q.c,
      change: numOrNull(q.d),
      changePercent: numOrNull(q.dp),
      open: numOrNull(q.o),
      high: numOrNull(q.h),
      low: numOrNull(q.l),
      prevClose: numOrNull(q.pc),
      time: q.t ? new Date(q.t * 1000).toISOString() : null,
    };
  }

  async function quoteMany(rawList) {
    const symbols = [...new Set(String(rawList || "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => SYMBOL_RE.test(s)))];
    if (!symbols.length) throw httpError(400, "Pass symbols=AAPL,MSFT");
    if (symbols.length > 20) throw httpError(400, "At most 20 symbols at a time");
    const out = {};
    const results = await Promise.allSettled(symbols.map((s) => quote(s)));
    results.forEach((r, i) => { if (r.status === "fulfilled") out[symbols[i]] = r.value; });
    return out;
  }

  async function profile(raw) {
    const symbol = normalizeSymbol(raw);
    return cached(`profile:${symbol}`, TTL.profile, async () => {
      const p = await finnhub("/stock/profile2", { symbol });
      if (!p || !p.name) {
        // ETFs and some listings have no company profile; fall back to our curated name.
        if (CURATED_NAMES[symbol]) return { symbol, name: CURATED_NAMES[symbol], type: "ETF/fund" };
        throw httpError(404, `No company profile for ${symbol}`);
      }
      return {
        symbol,
        name: p.name,
        logo: p.logo || null,
        industry: p.finnhubIndustry || null,
        exchange: p.exchange || null,
        country: p.country || null,
        currency: p.currency || null,
        ipo: p.ipo || null,
        marketCap: numOrNull(p.marketCapitalization), // millions of USD
        website: /^https?:\/\//.test(p.weburl || "") ? p.weburl : null,
      };
    });
  }

  async function metrics(raw) {
    const symbol = normalizeSymbol(raw);
    return cached(`metrics:${symbol}`, TTL.metrics, async () => {
      const data = await finnhub("/stock/metric", { symbol, metric: "all" });
      const m = (data && data.metric) || {};
      return {
        symbol,
        marketCap: numOrNull(m.marketCapitalization), // millions of USD
        peTTM: numOrNull(m.peTTM ?? m.peBasicExclExtraTTM),
        epsTTM: numOrNull(m.epsTTM ?? m.epsBasicExclExtraItemsTTM),
        week52High: numOrNull(m["52WeekHigh"]),
        week52Low: numOrNull(m["52WeekLow"]),
        beta: numOrNull(m.beta),
        dividendYield: numOrNull(m.currentDividendYieldTTM ?? m.dividendYieldIndicatedAnnual),
        avgVolume10d: numOrNull(m["10DayAverageTradingVolume"]), // millions of shares
      };
    });
  }

  async function news(raw) {
    const symbol = normalizeSymbol(raw);
    return cached(`news:${symbol}`, TTL.news, async () => {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 3600 * 1000);
      const items = await finnhub("/company-news", { symbol, from: isoDate(from), to: isoDate(to) });
      return (Array.isArray(items) ? items : [])
        .filter((n) => n && n.headline && /^https?:\/\//.test(n.url || ""))
        .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
        .slice(0, 5)
        .map((n) => ({
          headline: String(n.headline).slice(0, 300),
          source: n.source || null,
          url: n.url,
          datetime: n.datetime || null,
          summary: n.summary ? String(n.summary).slice(0, 400) : null,
        }));
    });
  }

  async function search(rawQuery) {
    const q = String(rawQuery || "").trim();
    if (!q || q.length > 40) throw httpError(400, "Enter 1-40 characters to search");
    const key = q.toUpperCase();
    return cached(`search:${key}`, TTL.search, async () => {
      const data = await finnhub("/search", { q, exchange: "US" });
      const results = ((data && data.result) || [])
        .filter((r) => r && US_TICKER_RE.test(r.symbol || "") && /common stock|etp|etf|adr/i.test(r.type || ""))
        .map((r) => ({ symbol: r.symbol, name: r.description || r.symbol, type: r.type || null }));
      // Exact ticker match first, then curated names, then the rest.
      return results
        .sort((a, b) => (b.symbol === key) - (a.symbol === key) || Boolean(CURATED_NAMES[b.symbol]) - Boolean(CURATED_NAMES[a.symbol]))
        .slice(0, 10);
    });
  }

  // Daily candles for a price-history chart. Some Finnhub plans don't include candles: then this reports
  // { available: false } instead of failing, and the page keeps the embedded TradingView chart.
  async function candles(raw, days = 365) {
    const symbol = normalizeSymbol(raw);
    const span = Math.min(Math.max(Number(days) || 365, 5), 1825);
    return cached(`candles:${symbol}:${span}`, TTL.candles, async () => {
      const to = Math.floor(Date.now() / 1000);
      const from = to - span * 24 * 3600;
      let data;
      try {
        data = await finnhub("/stock/candle", { symbol, resolution: "D", from: String(from), to: String(to) });
      } catch (err) {
        if (err.status === 502 && /plan/.test(err.message)) return { symbol, available: false, reason: "not on current plan" };
        throw err;
      }
      if (!data || data.s !== "ok" || !Array.isArray(data.c)) return { symbol, available: false, reason: data && data.s ? data.s : "no data" };
      return { symbol, available: true, points: data.t.map((t, i) => ({ t, c: data.c[i] })) };
    });
  }

  function curated() {
    return CURATED;
  }

  return { quote, quoteMany, profile, metrics, news, search, candles, curated };
}

module.exports = { createMarketData };

// Finnhub quote client with caching, so the API key never leaves the server.
const { config } = require("../config");

const SYMBOL_RE = /^[A-Z.]{1,10}$/;

function createQuoteService({ cache, fetchImpl = fetch, apiKey = config.finnhubApiKey }) {
  async function getQuote(rawSymbol) {
    const symbol = String(rawSymbol || "").toUpperCase();
    if (!SYMBOL_RE.test(symbol)) {
      const err = new Error("Invalid stock symbol");
      err.status = 400;
      throw err;
    }

    const key = `quote:${symbol}`;
    const cached = await cache.get(key);
    if (cached) return cached;

    if (!apiKey) {
      const err = new Error("FINNHUB_API_KEY is not configured");
      err.status = 503;
      throw err;
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    const response = await fetchImpl(url);
    if (!response.ok) {
      const err = new Error(`Quote provider returned ${response.status}`);
      err.status = 502;
      throw err;
    }
    const data = await response.json();
    if (data && typeof data.c === "number" && data.c > 0) {
      await cache.set(key, data, config.quoteCacheSeconds);
    }
    return data;
  }

  async function getQuotes(symbols) {
    const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
    const out = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value && r.value.c) out[symbols[i]] = r.value;
      else console.error(`Quote fetch failed for ${symbols[i]}:`, r.reason ? r.reason.message : r.value);
    });
    return out;
  }

  return { getQuote, getQuotes };
}

module.exports = { createQuoteService };

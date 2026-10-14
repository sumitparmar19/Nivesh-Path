// Finnhub quote client with caching, so the API key never leaves the server.
const { config } = require("../config");
const { logger } = require("./logger");

const SYMBOL_RE = /^[A-Z.]{1,10}$/;

// How Finnhub answered the last real (uncached) quote call, for GET /api/status. A rejected key (401/403 on the quote
// endpoint, which every plan includes) used to show only in the logs, while prices and the nightly job quietly failed.
//   ok · key_rejected · rate_limited · unreachable · error · not_configured · unknown (no call yet)
function outcomeOf(httpStatus) {
  if (httpStatus >= 200 && httpStatus < 300) return "ok";
  if (httpStatus === 401 || httpStatus === 403) return "key_rejected";
  if (httpStatus === 429) return "rate_limited";
  return "error";
}

function createQuoteService({ cache, fetchImpl = fetch, apiKey = config.finnhubApiKey }) {
  let health = { status: apiKey ? "unknown" : "not_configured", httpStatus: null, checkedAt: null };

  function record(status, httpStatus) {
    if (status === "key_rejected" && health.status !== "key_rejected") {
      logger.error("Finnhub rejected the API key (HTTP %d): check FINNHUB_API_KEY", httpStatus);
    }
    health = { status, httpStatus, checkedAt: new Date().toISOString() };
  }

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
    const data = await fetchQuote(symbol);
    if (data && typeof data.c === "number" && data.c > 0) {
      await cache.set(key, data, config.quoteCacheSeconds);
    }
    return data;
  }

  /** One uncached call to Finnhub; records how it answered. */
  async function fetchQuote(symbol) {
    if (!apiKey) {
      const err = new Error("FINNHUB_API_KEY is not configured");
      err.status = 503;
      throw err;
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`;
    let response;
    try {
      response = await fetchImpl(url);
    } catch (cause) {
      record("unreachable", null);
      throw cause;
    }
    record(outcomeOf(response.status), response.status);
    if (!response.ok) {
      const err = new Error(`Quote provider returned ${response.status}`);
      err.status = 502;
      throw err;
    }
    return response.json();
  }

  /** Start-up check (server.js): one uncached quote, so /api/status knows at once whether the key works. */
  async function checkKey(symbol = "SPY") {
    if (apiKey) await fetchQuote(symbol).catch(() => undefined);
    return getHealth();
  }

  async function getQuotes(symbols) {
    const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
    const out = {};
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value && r.value.c) out[symbols[i]] = r.value;
      else logger.error("Quote fetch failed for %s: %s", symbols[i], r.reason ? r.reason.message : r.value);
    });
    return out;
  }

  /** Last Finnhub outcome (no secrets): { status, httpStatus, checkedAt }. Never calls Finnhub itself. */
  function getHealth() {
    return { ...health };
  }

  return { getQuote, getQuotes, health: getHealth, checkKey };
}

module.exports = { createQuoteService };

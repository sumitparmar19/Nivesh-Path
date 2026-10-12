// Daily closing prices (Phase 3, PR F). The nightly job asks web to save today's close for every stock someone
// holds (POST /internal/jobs/snapshots/:symbol); rule v3 of the Behavioral Mirror then reads the 5-day move from
// these closes (behaviorRules.fiveDayFromSnapshots). Postgres table `price_snapshots`, one row per stock per
// trading day, so re-runs and market holidays (Finnhub then returns the previous day's quote) never duplicate.
// closeFromQuote() is pure: it decides which trading day a quote's price closes, or why it can't be saved yet.

const NY = "America/New_York";
const CLOSE_MINUTES = 16 * 60; // 4:00 pm New York: regular session close

const nyParts = (ms) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: NY, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t).value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, minutes: Number(get("hour")) * 60 + Number(get("minute")) };
};

/** New York calendar date (YYYY-MM-DD) of a moment. */
const nyDate = (ms) => nyParts(ms).date;

/**
 * The close a Finnhub quote ({ c: price, t: unix seconds of the last trade }) stands for, at moment `nowMs`:
 *   { tradingDate, close }  when the session of the quote's day has ended (or the quote is from an earlier day);
 *   { skip: reason }        when the market is still open today, or the quote has no usable price/time.
 */
function closeFromQuote(quote, nowMs) {
  if (!quote || typeof quote.c !== "number" || !(quote.c > 0)) return { skip: "no price in the quote" };
  if (typeof quote.t !== "number" || !(quote.t > 0)) return { skip: "no trade time in the quote" };
  const traded = nyParts(quote.t * 1000);
  const now = nyParts(nowMs);
  if (traded.date === now.date && now.minutes < CLOSE_MINUTES) return { skip: "market still open (before 4:00 pm New York)" };
  return { tradingDate: traded.date, close: Math.round(quote.c * 10000) / 10000 };
}

/** Postgres store (Prisma). save() is an upsert: the same stock and day twice keeps one row (the latest close). */
function createPgSnapshotStore({ prisma }) {
  async function save({ symbol, tradingDate, close }) {
    const day = new Date(`${tradingDate}T00:00:00Z`);
    const existing = await prisma.priceSnapshot.findUnique({ where: { symbol_tradingDate: { symbol, tradingDate: day } } });
    await prisma.priceSnapshot.upsert({
      where: { symbol_tradingDate: { symbol, tradingDate: day } },
      create: { symbol, tradingDate: day, close: String(close) },
      update: { close: String(close), capturedAt: new Date() },
    });
    return { created: !existing };
  }

  /** The newest `limit` closes for a stock, oldest first: [{ tradingDate: "YYYY-MM-DD", close }]. */
  async function recent(symbol, limit = 6) {
    const rows = await prisma.priceSnapshot.findMany({ where: { symbol }, orderBy: { tradingDate: "desc" }, take: limit });
    return rows.reverse().map((r) => ({ tradingDate: r.tradingDate.toISOString().slice(0, 10), close: Number(r.close) }));
  }

  return { kind: "postgres", save, recent };
}

/** In-memory store with the same interface (tests). */
function createMemorySnapshotStore() {
  const rows = new Map(); // `${symbol}|${date}` -> close
  return {
    kind: "memory",
    async save({ symbol, tradingDate, close }) {
      const key = `${symbol}|${tradingDate}`;
      const created = !rows.has(key);
      rows.set(key, close);
      return { created };
    },
    async recent(symbol, limit = 6) {
      return [...rows.entries()]
        .filter(([k]) => k.startsWith(`${symbol}|`))
        .map(([k, close]) => ({ tradingDate: k.split("|")[1], close }))
        .sort((a, b) => a.tradingDate.localeCompare(b.tradingDate))
        .slice(-limit);
    },
  };
}

module.exports = { closeFromQuote, nyDate, createPgSnapshotStore, createMemorySnapshotStore };

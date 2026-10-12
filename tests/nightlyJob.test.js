// Phase 3 PR F (nightly job): rule v3 boundaries (when our own daily closes are used for the 5-day move), which
// trading day a quote's price closes, the detector's data source and its fallback to Finnhub, and the nightly
// all-users concentration check. In-memory stores only; the Postgres table is covered in ledger.pg.test.js.
const rules = require("../src/lib/behaviorRules");
const { closeFromQuote, nyDate, createMemorySnapshotStore } = require("../src/lib/priceSnapshots");
const { createBehaviorDetector } = require("../src/lib/behaviorDetector");
const { createLedger } = require("../src/lib/ledger");

const closes = (dates, start = 100, step = 1) => dates.map((d, i) => ({ tradingDate: d, close: start + i * step }));
// Mon Oct 5 .. Mon Oct 12, 2026: six sessions (5 trading days of change), no holiday
const SIX = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"];

describe("rule v3: 5-day move from our own daily closes", () => {
  test("rule version is 3", () => {
    expect(rules.RULE_VERSION).toBe(3);
  });

  test("6 closes -> the return from the oldest to the newest (rounded to 0.01%)", () => {
    expect(rules.fiveDayFromSnapshots(closes(SIX, 100, 1), "2026-10-12")).toEqual({ fiveDayReturn: 5, asOf: "2026-10-12" });
    expect(rules.fiveDayFromSnapshots(closes(SIX, 200, -3), "2026-10-13").fiveDayReturn).toBe(-7.5);
  });

  test("boundary: 5 closes are not enough (falls back to Finnhub)", () => {
    expect(rules.fiveDayFromSnapshots(closes(SIX.slice(1)), "2026-10-12")).toBeNull();
    expect(rules.fiveDayFromSnapshots([], "2026-10-12")).toBeNull();
    expect(rules.fiveDayFromSnapshots(null, "2026-10-12")).toBeNull();
  });

  test("only the newest 6 are used when more are stored", () => {
    const seven = closes(["2026-10-02", ...SIX], 50, 10); // 50 (old), 60 ... 110
    expect(rules.fiveDayFromSnapshots(seven, "2026-10-12").fiveDayReturn).toBeCloseTo(((110 - 60) / 60) * 100, 2);
  });

  test("boundary: newest close at most 5 days old", () => {
    expect(rules.fiveDayFromSnapshots(closes(SIX), "2026-10-17")).not.toBeNull(); // 5 days
    expect(rules.fiveDayFromSnapshots(closes(SIX), "2026-10-18")).toBeNull(); // 6 days: the job stopped
  });

  test("boundary: the 6 closes span at most 8 calendar days (a missed job day falls back)", () => {
    // Thu Oct 8 .. Fri Oct 16 with the Monday holiday skipped: 8 days, fine
    const holiday = ["2026-10-08", "2026-10-09", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    expect(rules.fiveDayFromSnapshots(closes(holiday), "2026-10-16")).not.toBeNull();
    // Wed Oct 7 .. Fri Oct 16 (a gap): 9 days, so it's not a 5-trading-day move any more
    const gap = ["2026-10-07", "2026-10-08", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
    expect(rules.fiveDayFromSnapshots(closes(gap), "2026-10-16")).toBeNull();
  });

  test("a bad row (no close, zero) is never used", () => {
    const bad = closes(SIX);
    bad[0].close = 0;
    expect(rules.fiveDayFromSnapshots(bad, "2026-10-12")).toBeNull();
  });

  test("events record where the 5-day move came from, and re-grading keeps it", () => {
    const hit = rules.panicSell({ side: "sell", symbol: "X", price: 80, fiveDayReturn: -12, todayChange: 0, avgCost: 100, fiveDaySource: "snapshots" });
    expect(hit.facts.fiveDaySource).toBe("snapshots");
    expect(rules.regrade({ patternType: "panic_sell", symbol: "X", severity: hit.severity, facts: hit.facts }).facts.fiveDaySource).toBe("snapshots");
    const fomo = rules.fomoBuy({ side: "buy", symbol: "Y", price: 99, week52High: 100, fiveDayReturn: 16, todayChange: 0, fiveDaySource: "finnhub" });
    expect(fomo.facts.fiveDaySource).toBe("finnhub");
    // Thresholds are unchanged from v2: a v2 event re-grades to the same severity
    const v2 = { patternType: "fomo_buy", symbol: "Y", severity: fomo.severity, facts: { ...fomo.facts, fiveDaySource: undefined } };
    expect(rules.regrade(v2).severity).toBe(fomo.severity);
  });
});

describe("which trading day a quote closes", () => {
  const at = (iso) => Date.parse(iso);
  const t = (iso) => Math.floor(Date.parse(iso) / 1000);

  test("after 4:00 pm New York: today's last price is today's close", () => {
    // 16:30 EDT = 20:30 UTC on Mon Oct 12, 2026
    expect(closeFromQuote({ c: 123.456789, t: t("2026-10-12T20:00:00Z") }, at("2026-10-12T20:30:00Z"))).toEqual({ tradingDate: "2026-10-12", close: 123.4568 });
  });

  test("during the session: skipped, never saved as a close", () => {
    expect(closeFromQuote({ c: 120, t: t("2026-10-12T17:00:00Z") }, at("2026-10-12T17:05:00Z")).skip).toMatch(/market still open/);
    expect(closeFromQuote({ c: 120, t: t("2026-10-12T19:59:00Z") }, at("2026-10-12T19:59:59Z")).skip).toMatch(/market still open/);
  });

  test("weekend or holiday: Finnhub still shows the last session, which keeps its own date (no duplicate day)", () => {
    // Saturday morning: the quote is from Friday's close
    expect(closeFromQuote({ c: 99, t: t("2026-10-09T20:00:00Z") }, at("2026-10-10T14:00:00Z"))).toEqual({ tradingDate: "2026-10-09", close: 99 });
  });

  test("New York date, not UTC (a late-evening run stays on the same trading day)", () => {
    expect(nyDate(at("2026-10-13T01:30:00Z"))).toBe("2026-10-12"); // 9:30 pm EDT
    expect(closeFromQuote({ c: 50, t: t("2026-10-12T20:00:00Z") }, at("2026-10-13T01:30:00Z")).tradingDate).toBe("2026-10-12");
  });

  test("no usable price or time: skipped", () => {
    expect(closeFromQuote({ c: 0, t: 1 }, Date.now()).skip).toMatch(/no price/);
    expect(closeFromQuote({ c: 10 }, Date.now()).skip).toMatch(/no trade time/);
    expect(closeFromQuote(null, Date.now()).skip).toMatch(/no price/);
  });
});

describe("detector with daily closes", () => {
  const quiet = { warn: () => {}, log: () => {} };
  function events() {
    const rows = [];
    return {
      rows,
      create: async (doc) => { const d = { _id: String(rows.length + 1).padStart(24, "0"), ...doc }; rows.push(d); return d; },
      find: () => ({ sort: () => ({ lean: async () => [] }) }),
      updateMany: async () => ({}),
    };
  }
  const trade = { _id: "f".repeat(24), name: "DROP", price: 80, quantity: 1, transactionType: "sell" };

  async function run({ snapshots, momentum }) {
    const BehaviorEvent = events();
    const d = createBehaviorDetector({
      BehaviorEvent,
      ledgerStore: { markChecked: async () => {} },
      marketData: { momentum: momentum || (async () => ({ week52High: 120, fiveDayReturn: -1 })), quote: async () => ({ changePercent: 0, high: null }) },
      ledger: { summary: async () => ({ positions: [], cashBalance: 100000 }) },
      snapshots,
      log: quiet,
      now: () => Date.parse("2026-10-12T21:00:00Z"),
    });
    await d.detect({ userId: "u1", trade, avgCost: 100 });
    return BehaviorEvent.rows;
  }

  test("6 stored closes: the 5-day move comes from them, and the event says so", async () => {
    const snapshots = createMemorySnapshotStore();
    for (const r of closes(SIX, 100, -3)) await snapshots.save({ symbol: "DROP", ...r }); // 100 -> 85: -15%
    const [e] = await run({ snapshots }); // Finnhub would say -1% (no panic)
    expect(e).toMatchObject({ patternType: "panic_sell", severity: "medium", ruleVersion: 3 });
    expect(e.facts).toMatchObject({ fiveDayReturn: -15, fiveDaySource: "snapshots" });
  });

  test("not enough closes yet: Finnhub's figure, labelled finnhub", async () => {
    const snapshots = createMemorySnapshotStore();
    for (const r of closes(SIX.slice(1), 100, -3)) await snapshots.save({ symbol: "DROP", ...r });
    const [e] = await run({ snapshots, momentum: async () => ({ week52High: 120, fiveDayReturn: -11 }) });
    expect(e.facts).toMatchObject({ fiveDayReturn: -11, fiveDaySource: "finnhub" });
  });

  test("snapshot store failing: falls back to Finnhub, never throws", async () => {
    const broken = { recent: async () => { throw new Error("db down"); } };
    const [e] = await run({ snapshots: broken, momentum: async () => ({ week52High: 120, fiveDayReturn: -11 }) });
    expect(e.facts.fiveDaySource).toBe("finnhub");
  });

  test("Finnhub down but our closes are enough: the trade is still checked from them", async () => {
    const snapshots = createMemorySnapshotStore();
    for (const r of closes(SIX, 100, -3)) await snapshots.save({ symbol: "DROP", ...r });
    const down = async () => { throw new Error("Finnhub down"); };
    const BehaviorEvent = events();
    let marked = false;
    const d = createBehaviorDetector({
      BehaviorEvent, ledgerStore: { markChecked: async () => { marked = true; } },
      marketData: { momentum: down, quote: down }, ledger: { summary: async () => ({ positions: [], cashBalance: 100000 }) },
      snapshots, log: quiet, now: () => Date.parse("2026-10-12T21:00:00Z"),
    });
    await d.detect({ userId: "u1", trade, avgCost: 100 });
    expect(BehaviorEvent.rows[0].facts.fiveDaySource).toBe("snapshots");
    expect(marked).toBe(true);
  });

  test("nightly check: every user with trades, counts created events, one user's failure doesn't stop the rest", async () => {
    const BehaviorEvent = events();
    const summaries = {
      a: { positions: [{ symbol: "AAPL", market_value: 80000 }], cashBalance: 20000 }, // 80% -> high
      b: { positions: [{ symbol: "MSFT", market_value: 10000 }], cashBalance: 90000 }, // 10% -> nothing
    };
    const d = createBehaviorDetector({
      BehaviorEvent,
      ledgerStore: { usersWithTrades: async () => ["a", "broken", "b"], markChecked: async () => {} },
      marketData: { momentum: async () => ({}), quote: async () => ({}) },
      ledger: { summary: async (u) => { if (!summaries[u]) throw new Error("no prices"); return summaries[u]; } },
      log: quiet,
    });
    expect(await d.checkAllUsers()).toEqual({ users: 2, created: 1, failed: 1 });
    expect(BehaviorEvent.rows[0]).toMatchObject({ userId: "a", patternType: "overconcentration", severity: "high", tradeId: null });
    expect(BehaviorEvent.rows[0].facts.fromPriceMove).toBe(true);
  });
});

describe("ledger.heldSymbols (what the job snapshots)", () => {
  test("tickers with shares still held by anyone, sorted; sold-out positions are left out", async () => {
    const trades = {
      u1: [{ name: "TSLA", quantity: 2, price: 10, transactionType: "buy" }, { name: "AAPL", quantity: 1, price: 10, transactionType: "buy" }],
      u2: [{ name: "AAPL", quantity: 3, price: 10, transactionType: "buy" }, { name: "NVDA", quantity: 1, price: 10, transactionType: "buy" }, { name: "NVDA", quantity: 1, price: 12, transactionType: "sell" }],
    };
    const store = { usersWithTrades: async () => Object.keys(trades), listTrades: async (u) => trades[u].map((t, i) => ({ _id: String(i), timestamp: new Date(i), ...t })) };
    const ledger = createLedger({ store, quotes: { getQuote: async () => ({ c: 1 }) } });
    expect(await ledger.heldSymbols()).toEqual(["AAPL", "TSLA"]);
  });
});

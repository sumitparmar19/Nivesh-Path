// Phase 2C Behavioral Mirror tests: the pure rules (every severity boundary), the detector (dedup, fail-safe,
// time budget) and the /api/patterns routes (auth, user isolation, scores, AI insight), using in-memory models
// and the fake market data mode, so nothing calls Finnhub, MongoDB or the AI service.
process.env.JWT_SECRET = "test-secret";
const request = require("supertest");
const { createApp } = require("../src/app");
const rules = require("../src/lib/behaviorRules");
const { createBehaviorDetector } = require("../src/lib/behaviorDetector");
const { migrateBehaviorEvents, PHASE_2C_LAUNCH, RULE_V2_LAUNCH } = require("../src/lib/behaviorMigration");
const { cashForAnalysis } = require("../src/routes/ai");

// --- In-memory model: the Mongo operators these features use ---
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond === null) return value === null || value === undefined;
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      // Every operator present must hold (e.g. a $gte + $lt range).
      if ("$in" in cond && !cond.$in.map(String).includes(String(value))) return false;
      if ("$ne" in cond && value === cond.$ne) return false;
      if ("$exists" in cond && (value !== undefined) !== cond.$exists) return false;
      if ("$gte" in cond && !(value !== undefined && value >= cond.$gte)) return false;
      if ("$lt" in cond && !(value !== undefined && value < cond.$lt)) return false;
      return true;
    }
    return String(value) === String(cond);
  });
}
function apply(doc, update) {
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
  for (const [k, v] of Object.entries(update.$set || {})) doc[k] = v;
}
let clock = Date.parse("2026-10-01T00:00:00Z");
function model(defaults = {}) {
  const rows = [];
  let n = 0;
  const query = (list) => {
    let out = [...list];
    const q = {
      sort: (spec) => {
        const [[field, dir]] = Object.entries(spec);
        out.sort((a, b) => (a[field] > b[field] ? 1 : -1) * dir);
        return q;
      },
      limit: (k) => { out = out.slice(0, k); return q; },
      lean: async () => out.map((r) => ({ ...r })),
    };
    return q;
  };
  return {
    rows,
    create: async (doc) => {
      clock += 1000;
      const saved = { _id: (++n).toString(16).padStart(24, "a"), createdAt: new Date(clock), timestamp: new Date(clock), ...defaults, ...doc };
      rows.push(saved);
      return saved;
    },
    find: (f) => query(rows.filter((r) => matches(r, f))),
    countDocuments: async (f) => rows.filter((r) => matches(r, f)).length,
    findOne: async (f) => rows.find((r) => matches(r, f)) || null,
    findById: async (id) => rows.find((r) => String(r._id) === String(id)) || null,
    findOneAndUpdate: async (f, u) => { const d = rows.find((r) => matches(r, f)); if (d) apply(d, u); return d || null; },
    updateOne: async (f, u) => { const d = rows.find((r) => matches(r, f)); if (d) apply(d, u); return { matchedCount: d ? 1 : 0 }; },
    updateMany: async (f, u) => { const ds = rows.filter((r) => matches(r, f)); ds.forEach((d) => apply(d, u)); return { modifiedCount: ds.length }; },
    deleteMany: async (f) => { const b = rows.length; for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], f)) rows.splice(i, 1); return { deletedCount: b - rows.length }; },
    deleteOne: async (f) => { const i = rows.findIndex((r) => matches(r, f)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; },
  };
}
const eventModel = () => model({ acknowledged: false, clearedAt: null });

// ================= Pure rules =================
describe("behavior rules: panic sell (rule v2: only when selling at a loss)", () => {
  const sell = (fiveDayReturn, extra = {}) => rules.panicSell({ side: "sell", symbol: "TSLA", price: 90, avgCost: 100, fiveDayReturn, ...extra });

  test("no pattern under a 5% drop, for buys, or without data", () => {
    expect(sell(-4.99)).toBeNull();
    expect(sell(3)).toBeNull();
    expect(sell(null)).toBeNull();
    expect(rules.panicSell({ side: "buy", symbol: "TSLA", price: 90, avgCost: 100, fiveDayReturn: -30 })).toBeNull();
  });

  test("severity bands: 5% low, 10% medium, 20% high", () => {
    expect(sell(-5).severity).toBe("low");
    expect(sell(-9.99).severity).toBe("low");
    expect(sell(-10).severity).toBe("medium");
    expect(sell(-19.99).severity).toBe("medium");
    expect(sell(-20).severity).toBe("high");
  });

  test("B2: selling at or above average cost is not a panic sell; one cent below is", () => {
    expect(sell(-12, { price: 100 })).toBeNull(); // at cost
    expect(sell(-12, { price: 120 })).toBeNull(); // profit
    expect(sell(-5, { price: 99.99 }).severity).toBe("low");
  });

  test("B1: today's drop counts, taking the larger of the 5-day and today's drop", () => {
    expect(sell(0, { todayChange: -7 }).facts).toMatchObject({ drop: 7, fiveDayReturn: 0, todayChange: -7 });
    expect(sell(-12, { todayChange: -3 }).facts.drop).toBe(12);
    expect(sell(null, { todayChange: -4 })).toBeNull();
  });

  test("records the loss vs average cost and the share count", () => {
    expect(sell(-12, { quantity: 4 }).facts).toEqual({ price: 90, drop: 12, fiveDayReturn: -12, todayChange: null, avgCost: 100, vsCostPct: -10, quantity: 4 });
  });
});

describe("behavior rules: FOMO buy (rule v2: needs a real run-up)", () => {
  const buy = (price, fiveDayReturn, extra = {}) => rules.fomoBuy({ side: "buy", symbol: "NVDA", price, week52High: 100, fiveDayReturn, ...extra });

  test("A3: the live-test SPY buy (1.0% under the high, +1.7% in 5 days) is not flagged", () => {
    expect(rules.fomoBuy({ side: "buy", symbol: "SPY", price: 773.93, week52High: 781.62, fiveDayReturn: 1.7 })).toBeNull();
  });

  test("no flag below a 5% run-up, for sells, or without data", () => {
    expect(buy(99, 4.99)).toBeNull();
    expect(buy(99, null)).toBeNull();
    expect(rules.fomoBuy({ side: "sell", symbol: "NVDA", price: 99, week52High: 100, fiveDayReturn: 30 })).toBeNull();
  });

  test("boundaries near the high: 5% low, 10% + within 3% medium, 15% + within 2% high", () => {
    expect(buy(99, 5).severity).toBe("low");
    expect(buy(95, 9.99).severity).toBe("low");
    expect(buy(97, 10).severity).toBe("medium");
    expect(buy(96.9, 14).severity).toBe("low"); // 3.1% away
    expect(buy(98, 15).severity).toBe("high");
    expect(buy(97.99, 20).severity).toBe("medium"); // 2.01% away
  });

  test("change 3: a 15%+ run-up is at least low even far from the high; under 15% it is not flagged there", () => {
    expect(buy(90, 20)).toMatchObject({ severity: "low", facts: { percentFromHigh: 10, runUp: 20 } });
    expect(buy(90, 14.99)).toBeNull();
    expect(rules.fomoBuy({ side: "buy", symbol: "X", price: 50, week52High: null, fiveDayReturn: 16 }).severity).toBe("low");
  });

  test("B1: today's rise and today's intraday high are used", () => {
    expect(buy(99, 1, { todayChange: 6 }).facts).toMatchObject({ runUp: 6, todayChange: 6 });
    expect(buy(105, 16, { dayHigh: 106 }).facts).toMatchObject({ week52High: 106, percentFromHigh: 0.94 });
  });

  test("buying at a new high counts as 0% from the high", () => {
    expect(buy(105, 16).facts.percentFromHigh).toBe(0);
  });
});

describe("behavior rules: overconcentration (share of cash + holdings)", () => {
  const pct = (value, cash) => rules.concentration({ positions: [{ symbol: "AAPL", market_value: value }], cashBalance: cash })[0];

  test("a first small buy is not concentrated, because cash counts", () => {
    expect(pct(5000, 95000)).toMatchObject({ percent: 5, severity: null });
  });

  test("severity bands: over 35% low, over 50% medium, over 65% high", () => {
    expect(pct(35000, 65000).severity).toBeNull();
    expect(pct(40000, 60000).severity).toBe("low");
    expect(pct(55000, 45000).severity).toBe("medium");
    expect(pct(70000, 30000).severity).toBe("high");
  });

  test("dedup: record only when nothing is active or severity goes up", () => {
    expect(rules.shouldRecordConcentration(null, "low")).toBe(true);
    expect(rules.shouldRecordConcentration({ severity: "low" }, "low")).toBe(false);
    expect(rules.shouldRecordConcentration({ severity: "medium" }, "low")).toBe(false);
    expect(rules.shouldRecordConcentration({ severity: "low" }, "high")).toBe(true);
    expect(rules.shouldRecordConcentration(null, null)).toBe(false);
  });
});

describe("behavior rules: scores", () => {
  test("change 1: impulse control = UNFLAGGED checked trades / checked trades (4 checked, 1 flagged -> 75)", () => {
    expect(rules.scores({ checkedTrades: 4, flaggedTrades: 1, largestPercent: 0 }).impulseControl).toBe(75);
    expect(rules.scores({ checkedTrades: 10, flaggedTrades: 0, largestPercent: 0 }).impulseControl).toBe(100);
    expect(rules.scores({ checkedTrades: 3, flaggedTrades: 3, largestPercent: 0 }).impulseControl).toBe(0);
  });

  test("needs 3 checked trades before showing a number", () => {
    expect(rules.scores({ checkedTrades: 2, flaggedTrades: 0, largestPercent: 0 })).toMatchObject({ impulseControl: null, enoughTrades: false });
  });

  test("diversification is 100 minus the largest position's share of the account (live test account -> 90)", () => {
    expect(rules.scores({ checkedTrades: 0, flaggedTrades: 0, largestPercent: 0 }).diversification).toBe(100);
    expect(rules.diversification(9.53)).toBe(90);
  });

  test("regrade re-checks old events from their stored facts", () => {
    const oldSpy = { patternType: "fomo_buy", severity: "medium", symbol: "SPY", facts: { price: 773.93, week52High: 781.62, percentFromHigh: 0.98, fiveDayReturn: 1.7 } };
    expect(rules.regrade(oldSpy)).toBeNull();
    const realFomo = { patternType: "fomo_buy", severity: "medium", symbol: "X", facts: { price: 99, week52High: 100, fiveDayReturn: 16 } };
    expect(rules.regrade(realFomo).severity).toBe("high");
    expect(rules.regrade({ patternType: "panic_sell", severity: "low", symbol: "Y", facts: { price: 110, fiveDayReturn: -8, avgCost: 100 } })).toBeNull();
  });
});

// ================= Detector =================
describe("behavior detector", () => {
  const quiet = { warn: () => {}, log: () => {} };
  const trade = (side, symbol, price, quantity = 1) => ({ _id: "f".repeat(24), name: symbol, price, quantity, transactionType: side });
  const flat = async () => ({ changePercent: 0, high: null });
  function detector({ momentum, quote = flat, positions = [], cash = 100000, BehaviorEvent = eventModel(), Purchase = model() } = {}) {
    const state = { positions, cash, t: 0 };
    const d = createBehaviorDetector({
      BehaviorEvent, Purchase,
      marketData: { momentum: momentum || (async () => ({ week52High: null, fiveDayReturn: null })), quote },
      ledger: { summary: async () => ({ positions: state.positions, cashBalance: state.cash }) },
      log: quiet,
      now: () => state.t,
    });
    return { d, BehaviorEvent, Purchase, state };
  }

  test("a FOMO buy is saved with its trade id, rule version and computed facts, and the trade is marked checked", async () => {
    const Purchase = model();
    const t = await Purchase.create({ userId: "u1", name: "HYPE", price: 100, quantity: 3, transactionType: "buy" });
    const { d, BehaviorEvent } = detector({ Purchase, momentum: async () => ({ week52High: 101, fiveDayReturn: 18 }) });
    const out = await d.detect({ userId: "u1", trade: { ...t } });
    expect(out).toHaveLength(1);
    expect(BehaviorEvent.rows[0]).toMatchObject({ userId: "u1", patternType: "fomo_buy", severity: "high", symbol: "HYPE", tradeId: t._id, ruleVersion: 2 });
    expect(BehaviorEvent.rows[0].facts).toMatchObject({ percentFromHigh: 0.99, quantity: 3 });
    expect(Purchase.rows[0].behaviorCheckedAt).toBeInstanceOf(Date);
  });

  test("a panic sell below cost is saved; today's crash alone is enough", async () => {
    const { d, BehaviorEvent } = detector({ momentum: async () => ({ week52High: 140, fiveDayReturn: 0 }), quote: async () => ({ changePercent: -12, high: 91 }) });
    await d.detect({ userId: "u1", trade: trade("sell", "DROP", 80), avgCost: 100 });
    expect(BehaviorEvent.rows[0]).toMatchObject({ patternType: "panic_sell", severity: "medium" });
    expect(BehaviorEvent.rows[0].facts).toMatchObject({ vsCostPct: -20, todayChange: -12 });
  });

  test("market data down: panic/FOMO skipped, trade NOT marked checked, concentration still checked, never rejects", async () => {
    const Purchase = model();
    const t = await Purchase.create({ userId: "u1", name: "AAPL", price: 100, quantity: 1, transactionType: "buy" });
    const down = async () => { throw new Error("Finnhub down"); };
    const { d } = detector({ Purchase, momentum: down, quote: down, positions: [{ symbol: "AAPL", market_value: 80000 }], cash: 20000 });
    const out = await d.detect({ userId: "u1", trade: { ...t } });
    expect(out.map((e) => e.patternType)).toEqual(["overconcentration"]);
    expect(Purchase.rows[0].behaviorCheckedAt).toBeUndefined();
    const broken = createBehaviorDetector({ BehaviorEvent: { create: async () => { throw new Error("db"); }, find: () => { throw new Error("db"); } }, marketData: { momentum: async () => ({ week52High: 100, fiveDayReturn: 20 }), quote: flat }, ledger: { summary: async () => { throw new Error("db"); } }, log: quiet });
    await expect(broken.detect({ userId: "u1", trade: trade("buy", "AAPL", 100) })).resolves.toEqual([]);
  });

  test("overconcentration: no duplicates, warns again when worse, resets after dropping under 35%", async () => {
    const { d, BehaviorEvent, state } = detector({ positions: [{ symbol: "AAPL", market_value: 40000 }], cash: 60000 });
    const run = () => d.detect({ userId: "u1", trade: trade("buy", "AAPL", 100) });
    await run(); // 40% -> low
    await run(); // still 40% -> no duplicate
    expect(BehaviorEvent.rows).toHaveLength(1);
    state.positions = [{ symbol: "AAPL", market_value: 60000 }]; state.cash = 40000;
    await run(); // 60% -> medium, worse -> new event
    expect(BehaviorEvent.rows.map((e) => e.severity)).toEqual(["low", "medium"]);
    state.positions = [{ symbol: "AAPL", market_value: 20000 }]; state.cash = 80000;
    await run(); // back to 20% -> both cleared
    expect(BehaviorEvent.rows.every((e) => e.clearedAt instanceof Date)).toBe(true);
    state.positions = [{ symbol: "AAPL", market_value: 40000 }]; state.cash = 60000;
    await run(); // re-crossing -> warned again
    expect(BehaviorEvent.rows).toHaveLength(3);
    expect(BehaviorEvent.rows[2]).toMatchObject({ severity: "low", clearedAt: null });
  });

  test("selling a whole position clears its active warning", async () => {
    const { d, BehaviorEvent, state } = detector({ positions: [{ symbol: "AAPL", market_value: 70000 }], cash: 30000 });
    await d.detect({ userId: "u1", trade: trade("buy", "AAPL", 100) });
    state.positions = []; state.cash = 100000;
    await d.detect({ userId: "u1", trade: trade("sell", "AAPL", 100) });
    expect(BehaviorEvent.rows[0].clearedAt).toBeInstanceOf(Date);
  });

  test("B4: price moves alone create and clear warnings, at most once per 15 minutes", async () => {
    const { d, BehaviorEvent, state } = detector({ positions: [{ symbol: "NVDA", market_value: 30000 }], cash: 70000 });
    expect(await d.checkPrices("u1")).toEqual([]); // 30%: nothing
    state.positions = [{ symbol: "NVDA", market_value: 45000 }]; state.cash = 55000; // grew to 45%
    state.t = 10 * 60 * 1000;
    expect(await d.checkPrices("u1")).toEqual([]); // throttled
    state.t = 15 * 60 * 1000;
    const [e] = await d.checkPrices("u1");
    expect(e).toMatchObject({ patternType: "overconcentration", severity: "low", tradeId: null, facts: { fromPriceMove: true } });
    state.positions = [{ symbol: "NVDA", market_value: 20000 }]; state.cash = 80000;
    state.t = 30 * 60 * 1000;
    await d.checkPrices("u1");
    expect(BehaviorEvent.rows[0].clearedAt).toBeInstanceOf(Date);
  });

  test("detectWithin gives up after its budget but the detection still finishes and saves", async () => {
    let finish;
    const gate = new Promise((r) => { finish = r; });
    const { d, BehaviorEvent } = detector({ momentum: async () => { await gate; return { week52High: 101, fiveDayReturn: 18 }; } });
    const started = Date.now();
    expect(await d.detectWithin({ userId: "u1", trade: trade("buy", "HYPE", 100) }, 50)).toBeNull();
    expect(Date.now() - started).toBeLessThan(1000);
    finish();
    await new Promise((r) => setTimeout(r, 20));
    expect(BehaviorEvent.rows.map((e) => e.patternType)).toContain("fomo_buy");
  });
});

// ================= Start-up clean-up (rule v2) =================
describe("behavior rule clean-up", () => {
  const quiet = { warn: () => {}, log: () => {} };
  async function seed() {
    const Purchase = model();
    const BehaviorEvent = eventModel();
    const before = new Date("2026-09-01T00:00:00Z");
    const after = new Date(PHASE_2C_LAUNCH.getTime() + 3600 * 1000);
    // Dated before launch so only change 4 (not the post-launch bulk marking) can mark it as checked.
    const spy = await Purchase.create({ userId: "u1", name: "SPY", price: 773.93, quantity: 4, transactionType: "buy", timestamp: before });
    const hype = await Purchase.create({ userId: "u1", name: "HYPE", price: 99, quantity: 1, transactionType: "buy", timestamp: after });
    const old = await Purchase.create({ userId: "u1", name: "AAPL", price: 150, quantity: 1, transactionType: "buy", timestamp: before });
    await BehaviorEvent.create({ userId: "u1", tradeId: spy._id, patternType: "fomo_buy", severity: "medium", symbol: "SPY", facts: { price: 773.93, week52High: 781.62, percentFromHigh: 0.98, fiveDayReturn: 1.7 } });
    await BehaviorEvent.create({ userId: "u1", tradeId: hype._id, patternType: "fomo_buy", severity: "medium", symbol: "HYPE", facts: { price: 99, week52High: 100, fiveDayReturn: 16 } });
    await BehaviorEvent.create({ userId: "u1", tradeId: null, patternType: "overconcentration", severity: "low", symbol: "NVDA", facts: { percentOfAccount: 40 } });
    return { Purchase, BehaviorEvent, spy, old };
  }

  test("deletes false alarms, re-grades the rest, and logs the counts", async () => {
    const { Purchase, BehaviorEvent } = await seed();
    const counts = await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: quiet });
    expect(counts).toMatchObject({ checked: 3, deleted: 1, regraded: 1, unchanged: 1 });
    expect(BehaviorEvent.rows.map((e) => [e.symbol, e.severity, e.ruleVersion])).toEqual([["HYPE", "high", 2], ["NVDA", "low", 2]]);
  });

  test("change 4: the trade of a deleted false alarm stays as a clean checked trade; pre-2C trades stay unchecked", async () => {
    const { Purchase, BehaviorEvent, spy, old } = await seed();
    await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: quiet });
    expect(Purchase.rows.find((t) => t._id === spy._id).behaviorCheckedAt).toBeInstanceOf(Date);
    expect(Purchase.rows.find((t) => t._id === old._id).behaviorCheckedAt).toBeUndefined();
  });

  test("a trade made after rule v2 went live whose check did not run stays unchecked, even after two runs", async () => {
    const { Purchase, BehaviorEvent } = await seed();
    const between = await Purchase.create({ userId: "u1", name: "MSFT", price: 500, quantity: 1, transactionType: "buy", timestamp: new Date(RULE_V2_LAUNCH.getTime() - 60 * 1000) });
    const unchecked = await Purchase.create({ userId: "u1", name: "NVDA", price: 180, quantity: 2, transactionType: "buy", timestamp: new Date(RULE_V2_LAUNCH.getTime() + 60 * 1000) });
    await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: { warn: () => {}, log: () => {} } });
    await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: { warn: () => {}, log: () => {} } });
    expect(Purchase.rows.find((t) => t._id === unchecked._id).behaviorCheckedAt).toBeUndefined();
    expect(Purchase.rows.find((t) => t._id === between._id).behaviorCheckedAt).toBeInstanceOf(Date); // v1 era: was checked
  });

  test("is safe to run twice", async () => {
    const { Purchase, BehaviorEvent } = await seed();
    await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: quiet });
    const again = await migrateBehaviorEvents({ BehaviorEvent, Purchase, log: quiet });
    expect(again).toMatchObject({ checked: 0, deleted: 0, tradesMarked: 0 });
    expect(BehaviorEvent.rows).toHaveLength(2);
  });
});

// ================= Advisor cash (A1, change 2) =================
describe("advisor cash for analysis", () => {
  const live = [
    { symbol: "SPY", quantity: 11, avg_price: 773.93, current_price: 773.93 },
    { symbol: "MSFT", quantity: 7, avg_price: 522.61, current_price: 522.61 },
    { symbol: "INTC", quantity: 89, avg_price: 107.08, current_price: 107.08 },
  ];

  test("real holdings: the real cash is used", () => {
    expect(cashForAnalysis({ realCash: 78298.38, realTotal: 100000, holdings: live, isWhatIf: false })).toBe(78298.38);
  });

  test("change 2: a what-if holding spends cash, so the account stays at its real value", () => {
    const whatIf = [...live, { symbol: "NVDA", quantity: 10, avg_price: 180, current_price: 180 }];
    expect(cashForAnalysis({ realCash: 78298.38, realTotal: 100000, holdings: whatIf, isWhatIf: true })).toBe(76498.38);
  });

  test("removing a holding frees cash; cash never goes below 0", () => {
    expect(cashForAnalysis({ realCash: 78298.38, realTotal: 100000, holdings: live.slice(0, 2), isWhatIf: true })).toBe(87828.5);
    expect(cashForAnalysis({ realCash: 10, realTotal: 100000, holdings: [{ symbol: "X", quantity: 1000, avg_price: 200, current_price: 200 }], isWhatIf: true })).toBe(0);
  });
});

// ================= Routes =================
function setup(overrides = {}) {
  const deps = {
    Purchase: model(),
    User: model({ cashBalance: 100000, totalDeposited: 100000 }),
    BehaviorEvent: eventModel(),
    Analysis: model(), Watchlist: model(), Message: model(),
    fakeMarket: true,
    mailer: { enabled: false, send: async () => false },
    aiClient: {
      ingestTransactions: async () => ({}),
      deleteMemory: async () => ({}),
      health: async () => ({}),
      analyzeBehavior: jest.fn(async (userId, payload) => ({ insight: `You traded ${payload.scores.tradeCount} times.`, ai_generated: false, model: null })),
      behaviorInsight: jest.fn(async () => ({ insight: "Saved insight", ai_generated: true, model: "claude", created_at: "2026-10-01T00:00:00Z" })),
    },
    spa: { distDir: "/nonexistent-react-build" },
    ...overrides,
  };
  return { app: createApp(deps), deps };
}
let n = 0;
async function newUser(app) {
  n += 1;
  const res = await request(app).post("/api/register").send({ name: `B ${n}`, email: `b${n}@test.com`, mobile: `80000000${n}`, password: "secret123" });
  return { token: res.body.token, id: res.body.user.id, password: "secret123" };
}
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const trade = (app, u, symbol, quantity, type = "BUY") => request(app).post("/api/store-purchase").set(auth(u)).send({ symbol, quantity, type });
// Fake prices never move, so a panic sell needs an earlier purchase at a higher price (B2: only losses count).
const seedBuy = (deps, u, symbol, quantity, price) =>
  deps.Purchase.create({ userId: u.id, name: symbol, price, quantity, total: price * quantity, transactionType: "buy" });

describe("/api/patterns routes", () => {
  test("every route needs a JWT", async () => {
    const { app } = setup();
    for (const [m, p] of [["get", "/api/patterns"], ["get", "/api/patterns/summary"], ["get", "/api/patterns/insight"], ["post", "/api/patterns/analyze"], ["post", "/api/patterns/acknowledge-all"], ["patch", "/api/patterns/aaaaaaaaaaaaaaaaaaaaaaaa/acknowledge"], ["delete", "/api/patterns/aaaaaaaaaaaaaaaaaaaaaaaa"]]) {
      expect([p, (await request(app)[m](p)).status]).toEqual([p, 401]);
    }
  });

  test("a fresh user has no patterns, zero counts and no impulse score yet", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect((await request(app).get("/api/patterns").set(auth(u))).body).toEqual({ patterns: [] });
    const s = (await request(app).get("/api/patterns/summary").set(auth(u))).body;
    expect(s).toMatchObject({ totalPatterns: 0, unreadCount: 0, byType: { panic_sell: 0, fomo_buy: 0, overconcentration: 0 }, largestPosition: null });
    expect(s.scores).toMatchObject({ impulseControl: null, diversification: 100, tradeCount: 0, enoughTrades: false });
  });

  test("a FOMO buy is flagged in the trade response and saved for that user only", async () => {
    const { app } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    const res = await trade(app, a, "FOMO", 10);
    expect(res.status).toBe(201);
    expect(res.body.behavior).toEqual([expect.objectContaining({ patternType: "fomo_buy", severity: "high", symbol: "FOMO" })]);
    const list = (await request(app).get("/api/patterns").set(auth(a))).body.patterns;
    expect(list).toHaveLength(1);
    expect(String(list[0].tradeId)).toBe(String(res.body.transaction._id));
    expect((await request(app).get("/api/patterns").set(auth(b))).body.patterns).toEqual([]);
  });

  test("a sell at a loss after a 5-day drop is a panic sell; a normal buy has an empty behavior list", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    expect((await trade(app, u, "DROP", 5)).body.behavior).toEqual([]);
    expect((await trade(app, u, "DROP", 5, "SELL")).body.behavior).toEqual([]); // sold at cost: not panic (B2)
    await seedBuy(deps, u, "DROP", 5, 100);
    const res = await trade(app, u, "DROP", 5, "SELL"); // $80 vs $100 average cost
    expect(res.body.behavior).toEqual([expect.objectContaining({ patternType: "panic_sell", severity: "medium" })]);
    expect(res.body.behavior[0].facts).toMatchObject({ vsCostPct: -20, quantity: 5 });
  });

  test("a big buy is flagged as overconcentration (share of cash + holdings)", async () => {
    const { app } = setup();
    const u = await newUser(app);
    const res = await trade(app, u, "DROP", 600); // $48,000 of $100,000
    expect(res.body.behavior).toEqual([expect.objectContaining({ patternType: "overconcentration", severity: "low", symbol: "DROP" })]);
    expect((await trade(app, u, "DROP", 1)).body.behavior).toEqual([]); // same severity: no duplicate
  });

  test("summary counts patterns and computes scores from the user's trades", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    await seedBuy(deps, u, "DROP", 1, 100); // made before checks existed: not counted in the score (B3)
    await trade(app, u, "FOMO", 1);
    await trade(app, u, "DROP", 1);
    await trade(app, u, "DROP", 1, "SELL");
    await trade(app, u, "AAPL", 1);
    const s = (await request(app).get("/api/patterns/summary").set(auth(u))).body;
    expect(s.byType).toEqual({ panic_sell: 1, fomo_buy: 1, overconcentration: 0 });
    expect(s.unreadCount).toBe(2);
    expect(s.scores).toMatchObject({ tradeCount: 5, checkedTrades: 4, flaggedTrades: 2, impulseControl: 50, enoughTrades: true });
  });

  test("filters work, bad filters are rejected and the limit is capped", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    await seedBuy(deps, u, "DROP", 1, 100);
    await trade(app, u, "FOMO", 1);
    await trade(app, u, "DROP", 1, "SELL");
    expect((await request(app).get("/api/patterns?type=panic_sell").set(auth(u))).body.patterns.map((p) => p.patternType)).toEqual(["panic_sell"]);
    expect((await request(app).get("/api/patterns?severity=high").set(auth(u))).body.patterns.map((p) => p.patternType)).toEqual(["fomo_buy"]);
    expect((await request(app).get("/api/patterns?type=bogus").set(auth(u))).status).toBe(400);
    const find = deps.BehaviorEvent.find;
    let limit;
    deps.BehaviorEvent.find = (f) => { const q = find(f); const lim = q.limit; q.limit = (k) => { limit = k; return lim(k); }; return q; };
    expect((await request(app).get("/api/patterns?limit=100000").set(auth(u))).status).toBe(200);
    expect(limit).toBe(100);
  });

  test("acknowledge and delete only work on your own patterns", async () => {
    const { app } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await trade(app, a, "FOMO", 1);
    const [p] = (await request(app).get("/api/patterns").set(auth(a))).body.patterns;
    expect((await request(app).patch(`/api/patterns/${p._id}/acknowledge`).set(auth(b))).status).toBe(404);
    expect((await request(app).delete(`/api/patterns/${p._id}`).set(auth(b))).status).toBe(404);
    expect((await request(app).patch("/api/patterns/not-an-id/acknowledge").set(auth(a))).status).toBe(404);
    const ack = await request(app).patch(`/api/patterns/${p._id}/acknowledge`).set(auth(a));
    expect(ack.body.pattern.acknowledged).toBe(true);
    expect((await request(app).get("/api/patterns/summary").set(auth(a))).body.unreadCount).toBe(0);
    expect((await request(app).delete(`/api/patterns/${p._id}`).set(auth(a))).body).toEqual({ deleted: true });
    expect((await request(app).get("/api/patterns").set(auth(a))).body.patterns).toEqual([]);
  });

  test("acknowledge-all marks every pattern read", async () => {
    const { app } = setup();
    const u = await newUser(app);
    await trade(app, u, "FOMO", 1);
    await trade(app, u, "FOMO", 1);
    await request(app).post("/api/patterns/acknowledge-all").set(auth(u));
    expect((await request(app).get("/api/patterns/summary").set(auth(u))).body.unreadCount).toBe(0);
  });

  test("analyze sends computed scores and the user's own events to the AI, never another user's", async () => {
    const { app, deps } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await trade(app, a, "FOMO", 1);
    await trade(app, b, "DROP", 1);
    await trade(app, b, "DROP", 1, "SELL");
    const res = await request(app).post("/api/patterns/analyze").set(auth(a));
    expect(res.body.insight).toBe("You traded 1 times.");
    const [userId, payload] = deps.aiClient.analyzeBehavior.mock.calls[0];
    expect(userId).toBe(a.id);
    expect(payload.events.map((e) => e.pattern_type)).toEqual(["fomo_buy"]);
    expect(payload.counts).toEqual({ panic_sell: 0, fomo_buy: 1, overconcentration: 0 });
    expect(payload.events[0].facts.percentFromHigh).toBe(0.99); // computed in code, not by the AI
  });

  test("AI service down: analyze answers 503 with a message, insight answers null", async () => {
    const down = async () => { throw new Error("ECONNREFUSED"); };
    const { app } = setup({ aiClient: { ingestTransactions: async () => ({}), analyzeBehavior: down, behaviorInsight: down } });
    const u = await newUser(app);
    const res = await request(app).post("/api/patterns/analyze").set(auth(u));
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/);
    expect((await request(app).get("/api/patterns/insight").set(auth(u))).body).toEqual({ insight: null });
  });

  test("the last saved insight is returned", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect((await request(app).get("/api/patterns/insight").set(auth(u))).body.insight).toBe("Saved insight");
  });

  test("slow market data: the trade waits at most ~1.5s, then returns without a behavior note", async () => {
    const { app } = setup({ marketData: { momentum: () => new Promise(() => {}), quote: () => new Promise(() => {}) } });
    const u = await newUser(app);
    const started = Date.now();
    const res = await trade(app, u, "AAPL", 1);
    expect(res.status).toBe(201);
    expect(res.body.behavior).toBeNull();
    expect(Date.now() - started).toBeLessThan(2500);
  });

  test("a broken detector never fails the trade", async () => {
    const { app } = setup({ detector: { detectWithin: async () => { throw new Error("boom"); } } });
    const u = await newUser(app);
    const res = await trade(app, u, "AAPL", 1);
    expect([res.status, res.body.success, res.body.behavior]).toEqual([201, true, null]);
  });

  test("reset and account deletion remove the user's patterns", async () => {
    const { app, deps } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await trade(app, a, "FOMO", 1);
    await trade(app, b, "FOMO", 1);
    await request(app).post("/api/portfolio/reset").set(auth(a)).send({ confirm: "RESET" });
    expect(deps.BehaviorEvent.rows.map((e) => String(e.userId))).toEqual([b.id]);
    await request(app).delete("/api/me").set(auth(b)).send({ password: b.password, confirm: "DELETE" });
    expect(deps.BehaviorEvent.rows).toHaveLength(0);
  });

  test("A7: each pattern carries its trade's share count and time", async () => {
    const { app } = setup();
    const u = await newUser(app);
    await trade(app, u, "FOMO", 4);
    const [p] = (await request(app).get("/api/patterns").set(auth(u))).body.patterns;
    expect(p.trade).toMatchObject({ quantity: 4, side: "buy" });
    expect(new Date(p.trade.timestamp).getTime()).toBeGreaterThan(0);
  });

  test("B5: an unchanged insight is reused without calling the AI; fresh calls are limited to 5 per hour", async () => {
    let saved = null;
    const analyzeBehavior = jest.fn(async (userId, payload) => (saved = { insight: "fresh", fingerprint: payload.fingerprint, ai_generated: true, created_at: "2026-10-09T00:00:00Z" }));
    const { app, deps } = setup();
    deps.aiClient.analyzeBehavior = analyzeBehavior;
    deps.aiClient.behaviorInsight = jest.fn(async () => saved);
    const u = await newUser(app);
    await trade(app, u, "FOMO", 1);
    await request(app).post("/api/patterns/analyze").set(auth(u));
    const again = await request(app).post("/api/patterns/analyze").set(auth(u));
    expect(again.body).toMatchObject({ insight: "fresh", reused: true });
    expect(analyzeBehavior).toHaveBeenCalledTimes(1);
    expect((await request(app).get("/api/patterns/insight").set(auth(u))).body.stale).toBe(false);
    await trade(app, u, "AAPL", 1); // data changed -> the saved insight is stale
    expect((await request(app).get("/api/patterns/insight").set(auth(u))).body.stale).toBe(true);
    let last;
    for (let i = 0; i < 5; i++) {
      await trade(app, u, "AAPL", 1);
      last = await request(app).post("/api/patterns/analyze").set(auth(u));
    }
    expect(last.status).toBe(429);
    expect(analyzeBehavior).toHaveBeenCalledTimes(5);
  });

  test("A4: a valid browser time zone is passed to the AI coach, a bad one is dropped", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    await trade(app, u, "FOMO", 1);
    await request(app).post("/api/patterns/analyze").set(auth(u)).send({ timezone: "America/Los_Angeles" });
    expect(deps.aiClient.analyzeBehavior.mock.calls[0][1].timezone).toBe("America/Los_Angeles");
    await trade(app, u, "AAPL", 1);
    await request(app).post("/api/patterns/analyze").set(auth(u)).send({ timezone: "Mars/Olympus" });
    expect(deps.aiClient.analyzeBehavior.mock.calls[1][1].timezone).toBeUndefined();
  });
});

describe("AI Advisor gets the whole account (A1)", () => {
  test("the advisor request includes the cash balance and the time zone", async () => {
    const analyzePortfolio = jest.fn(async () => ({ insight: {} }));
    const { app, deps } = setup();
    deps.aiClient.analyzePortfolio = analyzePortfolio;
    const u = await newUser(app);
    await trade(app, u, "AAPL", 10); // fake AAPL price
    await request(app).post("/api/ai/analyze-portfolio").set(auth(u)).send({ timezone: "America/Los_Angeles" });
    const sent = analyzePortfolio.mock.calls[0][0];
    const spent = deps.Purchase.rows[0].total;
    expect(sent.cash_balance).toBeCloseTo(100000 - spent, 2);
    expect(sent.timezone).toBe("America/Los_Angeles");
  });

  test("what-if holdings: the account keeps its real total (change 2)", async () => {
    const analyzePortfolio = jest.fn(async () => ({ insight: {} }));
    const { app, deps } = setup();
    deps.aiClient.analyzePortfolio = analyzePortfolio;
    const u = await newUser(app);
    await request(app).post("/api/ai/analyze-portfolio").set(auth(u)).send({ holdings: [{ symbol: "AAPL", quantity: 100, avg_price: 1 }] });
    const sent = analyzePortfolio.mock.calls[0][0];
    const value = sent.holdings[0].quantity * sent.holdings[0].current_price;
    expect(sent.cash_balance + value).toBeCloseTo(100000, 2);
  });
});

describe("AI internal token (B5)", () => {
  test("the backend sends X-Internal-Token when AI_INTERNAL_TOKEN is set, and nothing otherwise", async () => {
    const { createAiClient } = require("../src/lib/aiClient");
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({}) }));
    await createAiClient({ fetchImpl, baseUrl: "http://ai", internalToken: "s3cret" }).health();
    expect(fetchImpl.mock.calls[0][1].headers["X-Internal-Token"]).toBe("s3cret");
    await createAiClient({ fetchImpl, baseUrl: "http://ai", internalToken: "" }).health();
    expect(fetchImpl.mock.calls[1][1].headers["X-Internal-Token"]).toBeUndefined();
  });
});

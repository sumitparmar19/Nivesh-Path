// Phase 2C Behavioral Mirror tests: the pure rules (every severity boundary), the detector (dedup, fail-safe,
// time budget) and the /api/patterns routes (auth, user isolation, scores, AI insight), using in-memory models
// and the fake market data mode, so nothing calls Finnhub, MongoDB or the AI service.
process.env.JWT_SECRET = "test-secret";
const request = require("supertest");
const { createApp } = require("../src/app");
const rules = require("../src/lib/behaviorRules");
const { createBehaviorDetector } = require("../src/lib/behaviorDetector");

// --- In-memory model: the Mongo operators these features use ---
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond === null) return value === null || value === undefined;
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ("$in" in cond) return cond.$in.map(String).includes(String(value));
      if ("$gte" in cond) return value >= cond.$gte;
      if ("$exists" in cond) return (value !== undefined) === cond.$exists;
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
describe("behavior rules: panic sell", () => {
  const sell = (fiveDayReturn, extra = {}) => rules.panicSell({ side: "sell", symbol: "TSLA", price: 90, fiveDayReturn, ...extra });

  test("no pattern under a 5% drop, for buys, or without data", () => {
    expect(sell(-4.99)).toBeNull();
    expect(sell(3)).toBeNull();
    expect(sell(null)).toBeNull();
    expect(rules.panicSell({ side: "buy", symbol: "TSLA", price: 90, fiveDayReturn: -30 })).toBeNull();
  });

  test("severity bands: 5% low, 10% medium, 20% high", () => {
    expect(sell(-5).severity).toBe("low");
    expect(sell(-9.99).severity).toBe("low");
    expect(sell(-10).severity).toBe("medium");
    expect(sell(-19.99).severity).toBe("medium");
    expect(sell(-20).severity).toBe("high");
  });

  test("records whether it was sold at a loss vs average cost", () => {
    expect(sell(-12, { avgCost: 100 }).facts).toEqual({ price: 90, fiveDayReturn: -12, avgCost: 100, vsCostPct: -10 });
  });
});

describe("behavior rules: FOMO buy", () => {
  const buy = (price, fiveDayReturn = 0) => rules.fomoBuy({ side: "buy", symbol: "NVDA", price, week52High: 100, fiveDayReturn });

  test("no pattern more than 5% under the 52-week high, for sells, or without a high", () => {
    expect(buy(94.9)).toBeNull();
    expect(rules.fomoBuy({ side: "sell", symbol: "NVDA", price: 99, week52High: 100 })).toBeNull();
    expect(rules.fomoBuy({ side: "buy", symbol: "NVDA", price: 99, week52High: null })).toBeNull();
  });

  test("severity bands: within 5% low, within 3% medium, within 2% + 15% run-up high", () => {
    expect(buy(96).severity).toBe("low");
    expect(buy(97).severity).toBe("medium");
    expect(buy(98.5).severity).toBe("medium"); // close to the high but no run-up
    expect(buy(98.5, 15).severity).toBe("high");
    expect(buy(97.5, 20).severity).toBe("medium"); // run-up but 2.5% away
  });

  test("buying at a new high counts as 0% from the high", () => {
    expect(buy(105).facts.percentFromHigh).toBe(0);
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
  test("impulse control needs 3 trades; it is the share of trades without a panic/FOMO flag", () => {
    expect(rules.scores({ tradeCount: 2, flaggedTrades: 1, largestPercent: 0 })).toMatchObject({ impulseControl: null, enoughTrades: false });
    expect(rules.scores({ tradeCount: 4, flaggedTrades: 1, largestPercent: 0 }).impulseControl).toBe(75);
    expect(rules.scores({ tradeCount: 10, flaggedTrades: 0, largestPercent: 0 }).impulseControl).toBe(100);
  });

  test("diversification is 100 minus the largest position's share of the account", () => {
    expect(rules.scores({ tradeCount: 0, flaggedTrades: 0, largestPercent: 0 }).diversification).toBe(100);
    expect(rules.scores({ tradeCount: 5, flaggedTrades: 0, largestPercent: 62.4 }).diversification).toBe(38);
  });
});

// ================= Detector =================
describe("behavior detector", () => {
  const quiet = { warn: () => {} };
  const trade = (side, symbol, price) => ({ _id: "f".repeat(24), name: symbol, price, transactionType: side });
  function detector({ momentum, positions = [], cash = 100000, BehaviorEvent = eventModel() } = {}) {
    const state = { positions, cash };
    const d = createBehaviorDetector({
      BehaviorEvent,
      marketData: { momentum: momentum || (async (s) => ({ symbol: s, week52High: null, fiveDayReturn: null })) },
      ledger: { summary: async () => ({ positions: state.positions, cashBalance: state.cash }) },
      log: quiet,
    });
    return { d, BehaviorEvent, state };
  }

  test("a FOMO buy is saved with its trade id and computed facts", async () => {
    const { d, BehaviorEvent } = detector({ momentum: async () => ({ week52High: 101, fiveDayReturn: 18 }) });
    const out = await d.detect({ userId: "u1", trade: trade("buy", "HYPE", 100) });
    expect(out).toHaveLength(1);
    expect(BehaviorEvent.rows[0]).toMatchObject({ userId: "u1", patternType: "fomo_buy", severity: "high", symbol: "HYPE", tradeId: "f".repeat(24) });
    expect(BehaviorEvent.rows[0].facts.percentFromHigh).toBe(0.99);
  });

  test("a panic sell is saved with the loss vs average cost", async () => {
    const { d, BehaviorEvent } = detector({ momentum: async () => ({ week52High: 140, fiveDayReturn: -12 }) });
    await d.detect({ userId: "u1", trade: trade("sell", "DROP", 80), avgCost: 100 });
    expect(BehaviorEvent.rows[0]).toMatchObject({ patternType: "panic_sell", severity: "medium" });
    expect(BehaviorEvent.rows[0].facts.vsCostPct).toBe(-20);
  });

  test("market data down: panic/FOMO skipped, concentration still checked, never rejects", async () => {
    const { d, BehaviorEvent } = detector({
      momentum: async () => { throw new Error("Finnhub down"); },
      positions: [{ symbol: "AAPL", market_value: 80000 }], cash: 20000,
    });
    const out = await d.detect({ userId: "u1", trade: trade("buy", "AAPL", 100) });
    expect(out.map((e) => e.patternType)).toEqual(["overconcentration"]);
    const broken = createBehaviorDetector({ BehaviorEvent: { create: async () => { throw new Error("db"); }, find: () => { throw new Error("db"); } }, marketData: { momentum: async () => ({ week52High: 100, fiveDayReturn: 20 }) }, ledger: { summary: async () => { throw new Error("db"); } }, log: quiet });
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

  test("a sell after a 5-day drop is a panic sell; a normal buy has an empty behavior list", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect((await trade(app, u, "DROP", 5)).body.behavior).toEqual([]);
    const res = await trade(app, u, "DROP", 5, "SELL");
    expect(res.body.behavior).toEqual([expect.objectContaining({ patternType: "panic_sell", severity: "medium" })]);
  });

  test("a big buy is flagged as overconcentration (share of cash + holdings)", async () => {
    const { app } = setup();
    const u = await newUser(app);
    const res = await trade(app, u, "DROP", 600); // $48,000 of $100,000
    expect(res.body.behavior).toEqual([expect.objectContaining({ patternType: "overconcentration", severity: "low", symbol: "DROP" })]);
    expect((await trade(app, u, "DROP", 1)).body.behavior).toEqual([]); // same severity: no duplicate
  });

  test("summary counts patterns and computes scores from the user's trades", async () => {
    const { app } = setup();
    const u = await newUser(app);
    await trade(app, u, "FOMO", 1);
    await trade(app, u, "DROP", 1);
    await trade(app, u, "DROP", 1, "SELL");
    await trade(app, u, "AAPL", 1);
    const s = (await request(app).get("/api/patterns/summary").set(auth(u))).body;
    expect(s.byType).toEqual({ panic_sell: 1, fomo_buy: 1, overconcentration: 0 });
    expect(s.unreadCount).toBe(2);
    expect(s.scores).toMatchObject({ tradeCount: 4, flaggedTrades: 2, impulseControl: 50, enoughTrades: true });
  });

  test("filters work, bad filters are rejected and the limit is capped", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    await trade(app, u, "FOMO", 1);
    await trade(app, u, "DROP", 1);
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
    const { app } = setup({ marketData: { momentum: () => new Promise(() => {}) } });
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
});

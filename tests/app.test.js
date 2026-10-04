// API tests for the Express backend: per-user isolation, virtual cash ledger, auth and the AI proxy.
// Mongo, Finnhub and the AI service are replaced with in-memory fakes.
process.env.JWT_SECRET = "test-secret";

const request = require("supertest");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { createApp } = require("../src/app");
const { buildHoldings } = require("../src/lib/portfolio");
const { MemoryCache } = require("../src/lib/cache");

// --- Minimal in-memory Mongo model supporting the operators the app uses ---
function matches(doc, filter = {}) {
  if (filter.$or) return filter.$or.some((f) => matches(doc, f));
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("$gte" in cond && !(value >= cond.$gte)) return false;
      if ("$exists" in cond && (value !== undefined) !== cond.$exists) return false;
      return true;
    }
    return String(value) === String(cond);
  });
}
function applyUpdate(doc, update) {
  for (const [k, v] of Object.entries(update.$inc || {})) doc[k] = (doc[k] || 0) + v;
  Object.assign(doc, update.$set || {});
}
function fakeModel(initial = [], defaults = {}) {
  const rows = initial.map((r, i) => ({ _id: `seed${i}`, ...r }));
  let n = 0;
  const query = (result) => ({ sort: () => query(result), limit: () => query(result), lean: async () => result });
  return {
    rows,
    create: async (doc) => {
      const saved = { _id: `${(++n).toString(16).padStart(24, "0")}`, timestamp: new Date(), ...defaults, ...doc };
      rows.push(saved);
      return saved;
    },
    find: (filter) => query(rows.filter((r) => matches(r, filter))),
    countDocuments: async (filter) => rows.filter((r) => matches(r, filter)).length,
    findOne: async (filter) => rows.find((r) => matches(r, filter)) || null,
    findById: async (id) => rows.find((r) => String(r._id) === String(id)) || null,
    findOneAndUpdate: async (filter, update) => {
      const doc = rows.find((r) => matches(r, filter));
      if (!doc) return null;
      applyUpdate(doc, update);
      return doc;
    },
    updateOne: async (filter, update) => {
      const doc = rows.find((r) => matches(r, filter));
      if (doc) applyUpdate(doc, update);
      return { matchedCount: doc ? 1 : 0 };
    },
  };
}

function setup(overrides = {}) {
  const deps = {
    Purchase: fakeModel(),
    User: fakeModel([], { cashBalance: 100000, totalDeposited: 100000 }),
    quotes: {
      getQuote: async () => ({ c: 100 }),
      getQuotes: async (symbols) => Object.fromEntries(symbols.map((s) => [s, { c: 200 }])),
    },
    aiClient: {
      analyzePortfolio: jest.fn(async (payload) => ({ ok: true, received: payload })),
      ingestTransactions: jest.fn(async () => ({ stored: 1 })),
      health: jest.fn(async () => ({
        status: "ok", llm_configured: true, model: "claude-test",
        vector_index: { status: "ok", users: 2, transactions: 5, seconds: 0.4, failed_users: ["secret-user"] },
      })),
      memory: jest.fn(async (userId) => ({
        user_id: userId, indexed_trades: 1, durable_storage: true,
        index: { status: "ok", users: 2, transactions: 5, seconds: 0.4 }, patterns: [],
      })),
      rebuildMemory: jest.fn(async (userId) => ({
        user_id: userId, indexed_trades: 2, durable_storage: true,
        index: { status: "ok", users: 2, transactions: 5, seconds: 0.4 }, patterns: [],
      })),
    },
    ...overrides,
  };
  return { app: createApp(deps), deps };
}

let counter = 0;
async function newUser(app) {
  counter += 1;
  const creds = { name: `User ${counter}`, email: `u${counter}@test.com`, mobile: `90000000${counter}`, password: "secret123" };
  const res = await request(app).post("/api/register").send(creds);
  expect(res.status).toBe(201);
  return { ...creds, token: res.body.token, id: res.body.user.id };
}
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const buy = (app, u, symbol, quantity, price = 100) =>
  request(app).post("/api/store-purchase").set(auth(u)).send({ symbol, quantity, price, type: "BUY" });
const sell = (app, u, symbol, quantity, price = 100) =>
  request(app).post("/api/store-purchase").set(auth(u)).send({ symbol, quantity, price, type: "SELL" });

describe("health and static", () => {
  test("GET /health", async () => {
    const res = await request(setup().app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  test("serves the dashboard and advisor pages", async () => {
    const { app } = setup();
    expect((await request(app).get("/")).status).toBe(200);
    expect((await request(app).get("/advisor.html")).status).toBe(200);
  });

  test("never leaks the Finnhub key", async () => {
    process.env.FINNHUB_API_KEY = "secret-key";
    const res = await request(setup().app).get("/api/get-api-key");
    expect(JSON.stringify(res.body)).not.toContain("secret-key");
  });
});

describe("protected routes require a valid JWT", () => {
  const routes = [
    ["post", "/api/store-purchase"],
    ["post", "/store-purchase"],
    ["get", "/api/transactions"],
    ["get", "/transactions"],
    ["get", "/api/portfolio/holdings"],
    ["get", "/api/portfolio/cash-balance"],
    ["post", "/api/ai/analyze-portfolio"],
    ["get", "/api/me"],
    ["get", "/api/ai/memory"],
    ["post", "/api/ai/memory/rebuild"],
  ];
  test.each(routes)("%s %s without a token -> 401", async (method, path) => {
    const res = await request(setup().app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  test("forged or expired tokens are rejected", async () => {
    const { app } = setup();
    const forged = jwt.sign({ sub: "abc" }, "wrong-secret");
    const expired = jwt.sign({ sub: "abc", exp: Math.floor(Date.now() / 1000) - 60 }, "test-secret");
    for (const token of [forged, expired]) {
      const res = await request(app).get("/api/transactions").set("Authorization", `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });
});

describe("per-user isolation", () => {
  test("user A's trades and holdings are not visible to user B", async () => {
    const { app } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    expect((await buy(app, a, "TSLA", 3)).status).toBe(201);

    const aTx = await request(app).get("/api/transactions").set(auth(a));
    const bTx = await request(app).get("/api/transactions").set(auth(b));
    expect(aTx.body).toHaveLength(1);
    expect(String(aTx.body[0].userId)).toBe(a.id);
    expect(bTx.body).toHaveLength(0);

    const bHoldings = await request(app).get("/api/portfolio/holdings").set(auth(b));
    expect(bHoldings.body).toEqual([]);
  });

  test("user B cannot sell user A's shares", async () => {
    const { app } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await buy(app, a, "AAPL", 5);
    const res = await sell(app, b, "AAPL", 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("You own 0 AAPL shares");
  });
});

describe("virtual cash ledger", () => {
  test("buy with sufficient cash debits the balance at the live price", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    const res = await buy(app, u, "NVDA", 10, 1); // client claims $1, server uses live $100
    expect(res.status).toBe(201);
    expect(res.body.newBalance).toBe(99000);
    expect(res.body.transaction).toMatchObject({ name: "NVDA", price: 100, total: 1000, transactionType: "buy", priceSource: "live" });
    expect(deps.aiClient.ingestTransactions).toHaveBeenCalledWith(u.id, expect.any(Array));
  });

  test("buy with insufficient cash -> 400 and balance unchanged", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    const res = await buy(app, u, "TSLA", 2000); // $200,000
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Insufficient funds");
    expect(deps.User.rows.find((r) => r._id === u.id).cashBalance).toBe(100000);
    expect(deps.Purchase.rows).toHaveLength(0);
  });

  test("sell shares you don't own -> 400 with a clear message", async () => {
    const { app } = setup();
    const u = await newUser(app);
    const res = await sell(app, u, "TSLA", 1);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("You own 0 TSLA shares, so you can't sell 1.");
  });

  test("sell credits cash and the summary reflects holdings at live prices", async () => {
    const { app } = setup();
    const u = await newUser(app);
    await buy(app, u, "MSFT", 10); // -1000
    const res = await sell(app, u, "MSFT", 4); // +400
    expect(res.status).toBe(201);
    expect(res.body.newBalance).toBe(99400);

    const summary = await request(app).get("/api/portfolio/cash-balance").set(auth(u));
    expect(summary.body).toMatchObject({ cashBalance: 99400, holdingsValue: 1200, totalValue: 100600, totalPnl: 600 });
  });

  test("concurrent buys never overspend (atomic $inc)", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    const results = await Promise.all([1, 2, 3].map(() => buy(app, u, "AAPL", 400))); // 3 x $40,000
    expect(results.filter((r) => r.status === 201)).toHaveLength(2);
    expect(results.filter((r) => r.status === 400)).toHaveLength(1);
    expect(deps.User.rows.find((r) => r._id === u.id).cashBalance).toBe(20000);
  });

  test("concurrent sells can't sell the same shares twice", async () => {
    const { app } = setup();
    const u = await newUser(app);
    await buy(app, u, "UBER", 5);
    const results = await Promise.all([sell(app, u, "UBER", 5), sell(app, u, "UBER", 5)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
  });

  test("accounts created before the ledger get the $100k starting wallet", async () => {
    const User = fakeModel([], {}); // no default cashBalance, like old documents
    const { app } = setup({ User });
    const u = await newUser(app);
    expect(User.rows[0].cashBalance).toBeUndefined();
    const res = await buy(app, u, "WMT", 1);
    expect(res.status).toBe(201);
    expect(res.body.newBalance).toBe(99900);
  });

  test("rejects bad input", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect((await buy(app, u, "TSLA", 0)).status).toBe(400);
    expect((await buy(app, u, "not a symbol!", 1)).status).toBe(400);
    const badType = await request(app).post("/api/store-purchase").set(auth(u)).send({ symbol: "TSLA", quantity: 1, type: "HOLD" });
    expect(badType.status).toBe(400);
  });

  test("falls back to the client's price only when no live quote is available", async () => {
    const { app } = setup({ quotes: { getQuote: async () => { throw new Error("down"); }, getQuotes: async () => ({}) } });
    const u = await newUser(app);
    const res = await buy(app, u, "GS", 2, 50);
    expect(res.status).toBe(201);
    expect(res.body.transaction).toMatchObject({ price: 50, priceSource: "client" });
    expect((await buy(app, u, "GS", 2, 0)).status).toBe(503);
  });

  test("legacy Phase 1 request shape still works", async () => {
    const { app } = setup();
    const u = await newUser(app);
    const res = await request(app).post("/store-purchase").set(auth(u))
      .send({ name: "Tesla", price: 100, quantity: 1, total: 100, transactionType: "buy" });
    expect(res.status).toBe(201);
    expect(res.body.purchase.name).toBe("TSLA");
  });
});

describe("auth", () => {
  test("register returns a token; duplicates are rejected; login works by mobile or email", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect(u.token).toBeTruthy();
    const dup = await request(app).post("/api/register").send({ name: "X", email: u.email, mobile: "1", password: "secret123" });
    expect(dup.status).toBe(409);

    const byMobile = await request(app).post("/api/login").send({ mobile: u.mobile, password: u.password });
    const byEmail = await request(app).post("/api/login").send({ email: u.email.toUpperCase(), password: u.password });
    expect(byMobile.status).toBe(200);
    expect(byEmail.status).toBe(200);
    expect(byMobile.body.token).toBeTruthy();
    expect(byMobile.body.passwordHash).toBeUndefined();
    expect((await request(app).post("/api/login").send({ mobile: u.mobile, password: "wrong" })).status).toBe(401);
  });

  test("stored password is hashed and /api/me returns the profile with cash", async () => {
    const { app, deps } = setup();
    const u = await newUser(app);
    const stored = deps.User.rows.find((r) => r._id === u.id);
    expect(stored.passwordHash).not.toBe(u.password);
    expect(await bcrypt.compare(u.password, stored.passwordHash)).toBe(true);
    const me = await request(app).get("/api/me").set(auth(u));
    expect(me.body).toMatchObject({ email: u.email, cashBalance: 100000 });
  });
});

describe("AI advisor proxy", () => {
  test("uses only the caller's holdings, adds live prices and passes the user id", async () => {
    const { app, deps } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await buy(app, a, "NVDA", 3);
    await buy(app, b, "TSLA", 9);
    const res = await request(app).post("/api/ai/analyze-portfolio").set(auth(a)).send({ question: "Am I diversified?" });
    expect(res.status).toBe(200);
    const payload = deps.aiClient.analyzePortfolio.mock.calls[0][0];
    expect(payload.user_id).toBe(a.id);
    expect(payload.holdings).toEqual([{ symbol: "NVDA", quantity: 3, avg_price: 100, current_price: 200 }]);
  });

  test("returns 400 when the user has nothing to analyze", async () => {
    const { app } = setup();
    const u = await newUser(app);
    expect((await request(app).post("/api/ai/analyze-portfolio").set(auth(u)).send({})).status).toBe(400);
  });

  test("surfaces AI service failures as 502", async () => {
    const err = Object.assign(new Error("AI down"), { status: 502 });
    const { app } = setup({ aiClient: { analyzePortfolio: async () => Promise.reject(err), ingestTransactions: async () => ({}) } });
    const u = await newUser(app);
    const res = await request(app).post("/api/ai/analyze-portfolio").set(auth(u))
      .send({ holdings: [{ symbol: "AAPL", quantity: 1, avg_price: 10 }] });
    expect(res.status).toBe(502);
  });
});

describe("AI memory and status", () => {
  test("memory compares the caller's trades in MongoDB with what the AI has indexed", async () => {
    const { app, deps } = setup();
    const a = await newUser(app);
    const b = await newUser(app);
    await buy(app, a, "AAPL", 1);
    await buy(app, a, "MSFT", 1);
    await buy(app, b, "TSLA", 1);
    const res = await request(app).get("/api/ai/memory").set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ tradesInDatabase: 2, aiReachable: true, indexedTrades: 1, durableStorage: true });
    expect(deps.aiClient.memory).toHaveBeenCalledWith(a.id);

    const rebuilt = await request(app).post("/api/ai/memory/rebuild").set(auth(a));
    expect(rebuilt.body.indexedTrades).toBe(2);
    expect(deps.aiClient.rebuildMemory).toHaveBeenCalledWith(a.id);
  });

  test("memory still answers when the AI service is down", async () => {
    const down = setup({
      aiClient: { memory: async () => Promise.reject(new Error("down")), ingestTransactions: async () => ({}) },
    });
    const v = await newUser(down.app);
    const res = await request(down.app).get("/api/ai/memory").set(auth(v));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ tradesInDatabase: 0, aiReachable: false });
  });

  test("public status reports each service without leaking user ids", async () => {
    const res = await request(setup().app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.web).toBe("ok");
    expect(res.body.ai).toMatchObject({ reachable: true, llmConfigured: true, model: "claude-test" });
    expect(res.body.ai.vectorIndex).toEqual({ status: "ok", users: 2, transactions: 5, seconds: 0.4 });
    expect(JSON.stringify(res.body)).not.toContain("secret-user");
  });

  test("status says the AI is unreachable instead of failing", async () => {
    const { app } = setup({ aiClient: { health: async () => Promise.reject(new Error("down")) } });
    const res = await request(app).get("/api/status");
    expect(res.status).toBe(200);
    expect(res.body.ai).toEqual({ reachable: false });
  });
});

describe("portfolio math and quotes", () => {
  test("buildHoldings nets sells against average cost", () => {
    const holdings = buildHoldings([
      { name: "AAPL", price: 100, quantity: 10, transactionType: "buy", timestamp: "2025-01-01" },
      { name: "AAPL", price: 200, quantity: 10, transactionType: "buy", timestamp: "2025-01-02" },
      { name: "AAPL", price: 250, quantity: 5, transactionType: "sell", timestamp: "2025-01-03" },
      { name: "TSLA", price: 300, quantity: 1, transactionType: "buy", timestamp: "2025-01-01" },
      { name: "TSLA", price: 350, quantity: 1, transactionType: "sell", timestamp: "2025-01-02" },
    ]);
    expect(holdings).toEqual([{ symbol: "AAPL", quantity: 15, avg_price: 150 }]);
  });

  test("legacy company names map to tickers in holdings", () => {
    expect(buildHoldings([{ name: "Goldman Sachs", price: 10, quantity: 1, transactionType: "buy" }])).toEqual([
      { symbol: "GS", quantity: 1, avg_price: 10 },
    ]);
  });

  test("quote service caches quotes and rejects bad symbols", async () => {
    process.env.FINNHUB_API_KEY = "k";
    jest.resetModules();
    const { createQuoteService } = require("../src/lib/quotes");
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ c: 123 }) }));
    const svc = createQuoteService({ cache: new MemoryCache(), fetchImpl });
    expect((await svc.getQuote("aapl")).c).toBe(123);
    await svc.getQuote("AAPL");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(svc.getQuote("not a symbol!")).rejects.toMatchObject({ status: 400 });
  });
});

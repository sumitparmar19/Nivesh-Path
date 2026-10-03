// API tests for the Express backend using in-memory fakes for Mongo, Stripe, quotes and the AI service.
process.env.JWT_SECRET = "test-secret";

const request = require("supertest");
const bcrypt = require("bcryptjs");
const { createApp } = require("../src/app");
const { buildHoldings } = require("../src/lib/portfolio");
const { MemoryCache } = require("../src/lib/cache");

function fakeModel(initial = []) {
  const rows = [...initial];
  const query = (result) => ({
    sort: () => query(result),
    limit: () => query(result),
    lean: async () => result,
  });
  return {
    rows,
    create: async (doc) => {
      const saved = { _id: `id${rows.length + 1}`, timestamp: new Date(), ...doc };
      rows.push(saved);
      return saved;
    },
    find: () => query(rows),
    findOne: async (filter) => {
      const conds = filter.$or || [filter];
      return rows.find((r) => conds.some((c) => Object.entries(c).every(([k, v]) => r[k] === v))) || null;
    },
  };
}

function setup(overrides = {}) {
  const deps = {
    Purchase: fakeModel(),
    User: fakeModel(),
    quotes: {
      getQuote: async (s) => ({ c: 100, symbol: s }),
      getQuotes: async (symbols) => Object.fromEntries(symbols.map((s) => [s, { c: 200 }])),
    },
    aiClient: {
      analyzePortfolio: jest.fn(async (payload) => ({ ok: true, received: payload })),
      ingestTransactions: jest.fn(async () => ({ stored: 1 })),
    },
    stripe: {
      checkout: { sessions: { create: jest.fn(async () => ({ id: "cs_test", url: "https://stripe.test/cs" })) } },
    },
    ...overrides,
  };
  return { app: createApp(deps), deps };
}

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

describe("checkout", () => {
  test("legacy per-company route maps to the right symbol", async () => {
    const { app, deps } = setup();
    const res = await request(app).post("/create-checkout-session-tesla").send({ amount: 12.5 });
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://stripe.test/cs");
    const args = deps.stripe.checkout.sessions.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.unit_amount).toBe(1250);
    expect(args.line_items[0].price_data.product_data.name).toContain("TSLA");
  });

  test("rejects invalid amounts and unknown stocks", async () => {
    const { app } = setup();
    expect((await request(app).post("/create-checkout-session").send({ amount: "abc" })).status).toBe(400);
    expect((await request(app).post("/create-checkout-session-foo").send({ amount: 5 })).status).toBe(404);
  });

  test("returns 503 when Stripe is not configured", async () => {
    const { app } = setup({ stripe: null });
    expect((await request(app).post("/create-checkout-session").send({ amount: 5 })).status).toBe(503);
  });
});

describe("purchases and holdings", () => {
  test("stores a purchase, lists it, and notifies the AI service", async () => {
    const { app, deps } = setup();
    const res = await request(app)
      .post("/store-purchase")
      .send({ name: "aapl", price: 100, quantity: 2, total: 200, transactionType: "buy" });
    expect(res.status).toBe(201);
    expect(deps.aiClient.ingestTransactions).toHaveBeenCalled();

    const list = await request(app).get("/transactions");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("AAPL");
  });

  test("validates required fields", async () => {
    const res = await request(setup().app).post("/api/store-purchase").send({ name: "AAPL" });
    expect(res.status).toBe(400);
  });

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
});

describe("auth", () => {
  test("register then login returns a JWT", async () => {
    const { app } = setup();
    const user = { name: "Sumit", email: "S@x.com", mobile: "9999999999", password: "secret123" };
    expect((await request(app).post("/api/register").send(user)).status).toBe(201);
    expect((await request(app).post("/api/register").send(user)).status).toBe(409);

    const login = await request(app).post("/api/login").send({ mobile: user.mobile, password: user.password });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
    expect(login.body.email).toBe("s@x.com");
    expect(login.body.passwordHash).toBeUndefined();

    const bad = await request(app).post("/api/login").send({ mobile: user.mobile, password: "wrong" });
    expect(bad.status).toBe(401);
  });

  test("stored password is hashed", async () => {
    const { app, deps } = setup();
    await request(app).post("/api/register").send({ name: "A", email: "a@a.com", mobile: "1", password: "secret123" });
    expect(deps.User.rows[0].passwordHash).not.toBe("secret123");
    expect(await bcrypt.compare("secret123", deps.User.rows[0].passwordHash)).toBe(true);
  });
});

describe("AI advisor proxy", () => {
  test("builds holdings from transactions and adds live prices", async () => {
    const Purchase = fakeModel([{ name: "NVDA", price: 100, quantity: 3, total: 300, transactionType: "buy" }]);
    const { app, deps } = setup({ Purchase });
    const res = await request(app).post("/api/ai/analyze-portfolio").send({ question: "Am I diversified?" });
    expect(res.status).toBe(200);
    const payload = deps.aiClient.analyzePortfolio.mock.calls[0][0];
    expect(payload.holdings).toEqual([{ symbol: "NVDA", quantity: 3, avg_price: 100, current_price: 200 }]);
    expect(payload.question).toBe("Am I diversified?");
  });

  test("returns 400 when there is nothing to analyze", async () => {
    const res = await request(setup().app).post("/api/ai/analyze-portfolio").send({});
    expect(res.status).toBe(400);
  });

  test("surfaces AI service failures as 502", async () => {
    const err = Object.assign(new Error("AI down"), { status: 502 });
    const { app } = setup({
      aiClient: { analyzePortfolio: async () => Promise.reject(err), ingestTransactions: async () => ({}) },
    });
    const res = await request(app)
      .post("/api/ai/analyze-portfolio")
      .send({ holdings: [{ symbol: "AAPL", quantity: 1, avg_price: 10 }] });
    expect(res.status).toBe(502);
  });
});

describe("quote service", () => {
  test("caches quotes and rejects bad symbols", async () => {
    process.env.FINNHUB_API_KEY = "k";
    jest.resetModules();
    const { createQuoteService: create } = require("../src/lib/quotes");
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({ c: 123 }) }));
    const svc = create({ cache: new MemoryCache(), fetchImpl });
    expect((await svc.getQuote("aapl")).c).toBe(123);
    await svc.getQuote("AAPL");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(svc.getQuote("not a symbol!")).rejects.toMatchObject({ status: 400 });
  });
});

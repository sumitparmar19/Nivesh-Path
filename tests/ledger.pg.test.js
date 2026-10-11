// Postgres ledger integration tests (Phase 3, PR A): run against a real Postgres with the Prisma migrations
// applied. Skipped unless TEST_DATABASE_URL is set (CI sets it; locally:
//   TEST_DATABASE_URL=postgresql://postgres@localhost:5432/nivesh_test npx prisma migrate deploy && npm test).
// MongoDB (users) and Finnhub are in-memory fakes; the money goes through the real database.
process.env.JWT_SECRET = "test-secret";
const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { Types } = require("mongoose");

// CI sets REQUIRE_PG_TESTS=1 so a missing database fails the build instead of silently skipping these tests.
if (!TEST_DB && process.env.REQUIRE_PG_TESTS === "1") throw new Error("REQUIRE_PG_TESTS=1 but TEST_DATABASE_URL is not set");
const describeDb = TEST_DB ? describe : describe.skip;
jest.setTimeout(30000);

const TOKEN = "internal-test-token";
const PRICES = { AAPL: 100, TSLA: 250, CENT: 10.01 };

function fakeUsers() {
  const rows = new Map();
  return {
    rows,
    add(cash = 100000) {
      const id = new Types.ObjectId().toHexString();
      rows.set(id, { _id: id, email: `${id}@example.com`, name: "Test", cashBalance: cash, totalDeposited: 100000 });
      return id;
    },
    findById: async (id) => rows.get(String(id)) || null,
    deleteOne: async ({ _id }) => ({ deletedCount: rows.delete(String(_id)) ? 1 : 0 }),
  };
}

describeDb("Postgres ledger", () => {
  let PrismaClient;
  let prisma;
  let prisma2;
  let createApp;
  let createLedgerStore;
  let Users;
  let Purchase;

  beforeAll(() => {
    ({ PrismaClient } = require("@prisma/client"));
    ({ createApp } = require("../src/app"));
    ({ createLedgerStore } = require("../src/lib/ledgerStore"));
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    prisma2 = new PrismaClient({ datasources: { db: { url: TEST_DB } } }); // a second "web instance"
  });
  afterAll(async () => {
    await prisma.$disconnect();
    await prisma2.$disconnect();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe("TRUNCATE trades, accounts");
    Users = fakeUsers();
    Purchase = { deleteMany: jest.fn(async () => ({ deletedCount: 0 })) };
  });

  function makeApp(client = prisma, extra = {}) {
    const ledgerStore = createLedgerStore({ backend: "postgres", User: Users, Purchase, prisma: client });
    return createApp({
      User: Users,
      Purchase,
      ledgerStore,
      quotes: {
        getQuote: async (s) => ({ c: PRICES[s] || 50 }),
        getQuotes: async (symbols) => Object.fromEntries(symbols.map((s) => [s, { c: PRICES[s] || 50 }])),
      },
      aiClient: { ingestTransactions: jest.fn(async () => ({})), deleteMemory: async () => ({}), health: async () => ({}) },
      BehaviorEvent: null,
      detector: null,
      Analysis: null, Watchlist: null, Message: null,
      mailer: { enabled: false, send: async () => false },
      internalToken: TOKEN,
      spa: { distDir: "/nonexistent-react-build" },
      ...extra,
    });
  }
  const auth = (id) => ({ Authorization: `Bearer ${jwt.sign({ sub: id, email: `${id}@example.com` }, "test-secret")}` });
  const buy = (app, id, symbol, quantity, key) => {
    const r = request(app).post("/api/trades").set(auth(id));
    if (key) r.set("Idempotency-Key", key);
    return r.send({ symbol, quantity, type: "BUY" });
  };
  const sell = (app, id, symbol, quantity) => request(app).post("/api/trades").set(auth(id)).send({ symbol, quantity, type: "SELL" });
  const account = (id) => prisma.account.findUnique({ where: { userId: id } });

  // ---------- the database itself refuses bad money ----------
  describe("constraints (enforced by Postgres, not just the code)", () => {
    test("cash can never go negative", async () => {
      const id = Users.add();
      await prisma.account.create({ data: { userId: id, cash: 10, totalDeposited: 100000 } });
      await expect(prisma.$executeRaw`UPDATE accounts SET cash = cash - 10.01 WHERE user_id = ${id}`).rejects.toThrow(/accounts_cash_non_negative/);
      expect(Number((await account(id)).cash)).toBe(10);
    });

    test("quantity, price and total must be positive; side must be buy/sell; ids must be ObjectIds", async () => {
      const id = Users.add();
      await prisma.account.create({ data: { userId: id, cash: 100000, totalDeposited: 100000 } });
      const base = { id: new Types.ObjectId().toHexString(), userId: id, symbol: "AAPL", side: "buy", quantity: 1, price: 100, total: 100 };
      await expect(prisma.trade.create({ data: { ...base, quantity: 0 } })).rejects.toThrow(/trades_quantity_positive/);
      await expect(prisma.trade.create({ data: { ...base, price: -1 } })).rejects.toThrow(/trades_price_positive/);
      await expect(prisma.trade.create({ data: { ...base, total: 0 } })).rejects.toThrow(/trades_total_positive/);
      await expect(prisma.trade.create({ data: { ...base, side: "hold" } })).rejects.toThrow(/trades_side_valid/);
      await expect(prisma.trade.create({ data: { ...base, id: "not-an-object-id-at-all!" } })).rejects.toThrow(/trades_id_is_object_id/);
      await expect(prisma.trade.create({ data: { ...base, userId: new Types.ObjectId().toHexString() } })).rejects.toThrow(/Foreign key|trades_user_id_fkey/i);
      await prisma.trade.create({ data: base });
      expect(await prisma.trade.count()).toBe(1);
    });
  });

  // ---------- concurrency ----------
  describe("concurrency (row lock on the account)", () => {
    test("20 parallel $10,000 buys split across two app instances: exactly 10 fill and cash ends at $0.00", async () => {
      const id = Users.add();
      const [a, b] = [makeApp(prisma), makeApp(prisma2)];
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => buy(i % 2 ? b : a, id, "AAPL", 100)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(10);
      expect(statuses.filter((s) => s === 400)).toHaveLength(10);
      expect(results.find((r) => r.status === 400).body.error).toMatch(/Insufficient funds/);
      expect(Number((await account(id)).cash)).toBe(0);
      expect(await prisma.trade.count({ where: { userId: id } })).toBe(10);
    });

    test("10 parallel sells of 1 share when 5 are owned: exactly 5 fill", async () => {
      const id = Users.add();
      const app = makeApp();
      expect((await buy(app, id, "TSLA", 5)).status).toBe(201);
      const results = await Promise.all(Array.from({ length: 10 }, () => sell(app, id, "TSLA", 1)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(5);
      expect(results.filter((r) => r.status === 400)[0].body.error).toMatch(/You own 0 TSLA shares/);
      const holdings = await request(app).get("/api/portfolio/holdings").set(auth(id));
      expect(holdings.body).toEqual([]);
      expect(Number((await account(id)).cash)).toBe(100000);
    });
  });

  // ---------- idempotency ----------
  describe("Idempotency-Key", () => {
    test("a retry with the same key returns the original trade and charges once", async () => {
      const id = Users.add();
      const app = makeApp();
      const first = await buy(app, id, "AAPL", 3, "order-key-0001");
      const again = await buy(app, id, "AAPL", 3, "order-key-0001");
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body.replayed).toBe(true);
      expect(again.body.transaction._id).toBe(first.body.transaction._id);
      expect(again.body.newBalance).toBe(99700);
      expect(await prisma.trade.count({ where: { userId: id } })).toBe(1);
    });

    test("five copies of the same order sent at once (double-click, proxy retry) place one trade", async () => {
      const id = Users.add();
      const [a, b] = [makeApp(prisma), makeApp(prisma2)];
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) => buy(i % 2 ? b : a, id, "AAPL", 2, "same-order-xyz")));
      expect(results.every((r) => r.status === 200 || r.status === 201)).toBe(true);
      expect(new Set(results.map((r) => r.body.transaction._id)).size).toBe(1);
      expect(await prisma.trade.count({ where: { userId: id } })).toBe(1);
      expect(Number((await account(id)).cash)).toBe(99800);
    });

    test("keys are per user, and a malformed key is a 400", async () => {
      const [u1, u2] = [Users.add(), Users.add()];
      const app = makeApp();
      expect((await buy(app, u1, "AAPL", 1, "shared-key-123")).status).toBe(201);
      expect((await buy(app, u2, "AAPL", 1, "shared-key-123")).status).toBe(201);
      expect((await buy(app, u1, "AAPL", 1, "bad key!")).status).toBe(400);
    });
  });

  // ---------- money is exact ----------
  test("cents stay exact over many trades (NUMERIC, not floating point)", async () => {
    const id = Users.add();
    const app = makeApp();
    for (let i = 0; i < 10; i += 1) expect((await buy(app, id, "CENT", 1)).status).toBe(201);
    expect((await account(id)).cash.toString()).toBe("99899.9"); // 100000 - 10 x 10.01 (floats give 99899.89999999)
    const summary = await request(app).get("/api/portfolio/cash-balance").set(auth(id));
    expect(summary.body.cashBalance).toBe(99899.9);
    expect(summary.body.positions[0]).toMatchObject({ symbol: "CENT", quantity: 10, avg_price: 10.01 });
  });

  test("whole shares only: fractional and huge quantities are refused before touching the database", async () => {
    const id = Users.add();
    const app = makeApp();
    expect((await buy(app, id, "AAPL", 1.5)).body.error).toMatch(/whole number/);
    expect((await buy(app, id, "AAPL", 5000000)).body.error).toMatch(/at most 1,000,000/);
    expect(await prisma.trade.count()).toBe(0);
  });

  // ---------- accounts ----------
  test("a first trade opens the account with the user's MongoDB balance; unknown users get 401", async () => {
    const id = Users.add(5000);
    const app = makeApp();
    expect((await buy(app, id, "AAPL", 60)).body.error).toMatch(/you have \$5,000.00/);
    expect(Number((await account(id)).cash)).toBe(5000);
    const me = await request(app).get("/api/me").set(auth(id));
    expect(me.body.cashBalance).toBe(5000);
    const ghost = new Types.ObjectId().toHexString();
    expect((await buy(app, ghost, "AAPL", 1)).status).toBe(401);
    expect(await account(ghost)).toBeNull();
  });

  test("history, holdings, memory count and the internal API read the Postgres trades", async () => {
    const id = Users.add();
    const app = makeApp();
    await buy(app, id, "AAPL", 3);
    await buy(app, id, "TSLA", 2);
    await sell(app, id, "AAPL", 1);
    const history = await request(app).get("/api/transactions").set(auth(id));
    expect(history.body.map((t) => [t.name, t.transactionType, t.quantity])).toEqual([["AAPL", "sell", 1], ["TSLA", "buy", 2], ["AAPL", "buy", 3]]);
    expect(history.body[0]._id).toMatch(/^[0-9a-f]{24}$/);
    const holdings = await request(app).get("/api/portfolio/holdings").set(auth(id));
    expect(holdings.body).toEqual([{ symbol: "AAPL", quantity: 2, avg_price: 100 }, { symbol: "TSLA", quantity: 2, avg_price: 250 }]);

    const internal = await request(app).get(`/internal/trades?userId=${id}`).set("X-Internal-Token", TOKEN);
    expect(internal.status).toBe(200);
    expect(internal.body.trades.map((t) => [t.symbol, t.transaction_type, t.quantity, t.price])).toEqual([["AAPL", "buy", 3, 100], ["TSLA", "buy", 2, 250], ["AAPL", "sell", 1, 100]]);
    const users = await request(app).get("/internal/trades/users").set("X-Internal-Token", TOKEN);
    expect(users.body.users).toEqual([id]);
    expect((await request(app).get(`/internal/trades?userId=${id}`)).status).toBe(404);
    expect((await request(app).get(`/internal/trades?userId=${id}`).set("X-Internal-Token", "wrong")).status).toBe(404);
  });

  test("the Behavioral Mirror's checked marks are stored on the Postgres trade", async () => {
    const id = Users.add();
    const store = createLedgerStore({ backend: "postgres", User: Users, Purchase, prisma });
    const app = makeApp(prisma, { ledgerStore: store });
    const t = (await buy(app, id, "AAPL", 1)).body.transaction;
    await store.markChecked(id, t._id, new Date("2026-10-10T00:00:00Z"));
    expect(await store.countTrades(id, { checkedOnly: true })).toBe(1);
    await store.markCheckedIfUnset(id, t._id, new Date("2030-01-01T00:00:00Z"));
    expect((await store.findTrades(id, [t._id, "nonsense"]))[0].behaviorCheckedAt.toISOString()).toBe("2026-10-10T00:00:00.000Z");
    expect(await store.markCheckedBetween(new Date(0), new Date("2100-01-01"), new Date())).toBe(0);
  });

  // ---------- reset / delete / maintenance ----------
  test("reset deletes the trades and restores $100,000; account deletion removes everything", async () => {
    const id = Users.add();
    const app = makeApp();
    await buy(app, id, "AAPL", 10);
    const reset = await request(app).post("/api/portfolio/reset").set(auth(id)).send({ confirm: "RESET" });
    expect(reset.body).toMatchObject({ success: true, cashBalance: 100000, tradesRemoved: 1 });
    expect(Number((await account(id)).cash)).toBe(100000);

    await buy(app, id, "AAPL", 1);
    const store = createLedgerStore({ backend: "postgres", User: Users, Purchase, prisma });
    await store.deleteUser(id);
    expect(await account(id)).toBeNull();
    expect(await prisma.trade.count({ where: { userId: id } })).toBe(0); // ON DELETE CASCADE
    expect(Purchase.deleteMany).toHaveBeenCalledWith({ userId: id }); // and the pre-cutover Mongo copy
  });

  test("LEDGER_MAINTENANCE: trades and reset answer 503, reads keep working", async () => {
    const id = Users.add();
    await buy(makeApp(), id, "AAPL", 1);
    const paused = makeApp(prisma, { ledgerMaintenance: true });
    const trade = await buy(paused, id, "AAPL", 1);
    expect(trade.status).toBe(503);
    expect(trade.body.error).toMatch(/Trading is paused/);
    expect((await request(paused).post("/api/portfolio/reset").set(auth(id)).send({ confirm: "RESET" })).status).toBe(503);
    expect((await request(paused).get("/api/transactions").set(auth(id))).body).toHaveLength(1);
    expect(await prisma.trade.count()).toBe(1);
  });
});

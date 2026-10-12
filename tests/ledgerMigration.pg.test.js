// Ledger move MongoDB -> Postgres (Phase 3, PR B): the plan (pure; always runs) and the copy/verify/re-run against
// a real Postgres (needs TEST_DATABASE_URL with the Prisma migrations applied; CI sets it, see ledger.pg.test.js).
process.env.JWT_SECRET = "test-secret";
const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;
if (!TEST_DB && process.env.REQUIRE_PG_TESTS === "1") throw new Error("REQUIRE_PG_TESTS=1 but TEST_DATABASE_URL is not set");

const { Types } = require("mongoose");
const migration = require("../src/lib/ledgerMigration");
const { parseArgs } = require("../scripts/migrate-ledger");

const oid = () => new Types.ObjectId().toHexString();
const day = (d, h = 15) => new Date(Date.UTC(2026, 9, d, h));
const trade = (userId, name, quantity, price, transactionType, d, extra = {}) => ({
  _id: oid(), userId, name, quantity, price, total: price * quantity, transactionType, timestamp: day(d), priceSource: "live", ...extra,
});

/** A realistic MongoDB ledger: float leftovers, a company-name row, a legacy row, a deleted user's trade. */
function sampleMongo() {
  const alice = oid();
  const bob = oid();
  const carol = oid(); // signed up before the ledger existed: no cashBalance field
  const users = [
    { _id: alice, cashBalance: 100000 - 3 * 187.43999999999998 - 2 * 251.1 + 254.3, totalDeposited: 100000 },
    { _id: bob, cashBalance: 99899.89999999999, totalDeposited: 100000 },
    { _id: carol },
  ];
  const purchases = [
    trade(alice, "AAPL", 3, 187.43999999999998, "buy", 1, { behaviorCheckedAt: day(1, 16) }),
    trade(alice, "Tesla", 2, 251.1, "buy", 2), // old company-name row
    trade(alice, "TSLA", 1, 254.3, "sell", 3),
    ...Array.from({ length: 10 }, (_, i) => trade(bob, "CENT", 1, 10.01, "buy", 4 + (i % 3))),
    trade(null, "MSFT", 1, 400, "buy", 1), // from before per-user accounts
    trade(oid(), "NVDA", 1, 120, "buy", 1), // user deleted their account
  ];
  return { users, purchases, ids: { alice, bob, carol } };
}

describe("ledger move: the plan (no database)", () => {
  test("rounds half-up to the Postgres scales and lists every change", () => {
    const { users, purchases, ids } = sampleMongo();
    const p = migration.plan(users, purchases);
    const alice = p.users.find((u) => u.userId === ids.alice);
    expect(alice.trades.map((t) => [t.symbol, t.side, t.quantity, t.price.toFixed(4), t.total.toFixed(2)])).toEqual([
      ["AAPL", "buy", 3, "187.4400", "562.32"],
      ["TSLA", "buy", 2, "251.1000", "502.20"],
      ["TSLA", "sell", 1, "254.3000", "254.30"],
    ]);
    expect(alice.notes.some((n) => /price 187.439999\d* -> 187.4400/.test(n))).toBe(true);
    expect(p.users.find((u) => u.userId === ids.bob).cash.toFixed(2)).toBe("99899.90");
    expect(p.users.find((u) => u.userId === ids.carol).cash.toFixed(2)).toBe("100000.00");
    expect(p).toMatchObject({ legacyTrades: 1, orphanTrades: 1, orphanUsers: 1, blocking: [] });
  });

  test("fractional shares, bad rows and negative cash block the move", () => {
    const u = oid();
    const p = migration.plan(
      [{ _id: u, cashBalance: -5 }],
      [trade(u, "AAPL", 0.5, 100, "buy", 1), trade(u, "AAPL", 1, 0, "buy", 1), trade(u, "AAPL", 1, 100, "hold", 1), trade(u, "A VERY LONG NAME CO", 1, 1, "buy", 1)]
    );
    expect(p.blocking.join("\n")).toMatch(/fractional quantity 0.5/);
    expect(p.blocking.join("\n")).toMatch(/price 0 is not positive/);
    expect(p.blocking.join("\n")).toMatch(/side "hold"/);
    expect(p.blocking.join("\n")).toMatch(/can't be stored as a ticker/);
    expect(p.blocking.join("\n")).toMatch(/cash is negative/);
  });

  test("a stored total that disagrees with price x quantity is kept (it moved the cash) and reported", () => {
    const u = oid();
    const p = migration.plan([{ _id: u, cashBalance: 100 }], [{ ...trade(u, "AAPL", 3, 10, "buy", 1), total: 30.01 }]);
    expect(p.users[0].trades[0].total.toFixed(2)).toBe("30.01");
    expect(p.users[0].notes.join()).toMatch(/stored total 30.01 != price x quantity 30.00/);
  });

  test("a trade with no usable date is not saved as 1970: it gets its id's creation time, and the dry run says so", () => {
    const u = oid();
    const id = new Types.ObjectId(Math.floor(Date.UTC(2026, 8, 15, 12) / 1000)).toHexString(); // made 2026-09-15 12:00 UTC
    const bad = new Types.ObjectId(Math.floor(Date.UTC(2026, 8, 16, 12) / 1000)).toHexString();
    const p = migration.plan([{ _id: u, cashBalance: 100 }], [
      { ...trade(u, "AAPL", 1, 10, "buy", 1), _id: id, timestamp: undefined },
      { ...trade(u, "AAPL", 1, 10, "buy", 1), _id: bad, timestamp: "not a date" },
    ]);
    const [a, b] = p.users[0].trades;
    expect(a.executedAt.toISOString()).toBe("2026-09-15T12:00:00.000Z");
    expect(b.executedAt.toISOString()).toBe("2026-09-16T12:00:00.000Z");
    expect(p.users[0].notes).toEqual([
      `trade ${id}: no timestamp (missing): using the time from its id, 2026-09-15T12:00:00.000Z`,
      `trade ${bad}: no timestamp ("not a date"): using the time from its id, 2026-09-16T12:00:00.000Z`,
    ]);
    expect(p.users[0].trades.every((t) => t.executedAt.getUTCFullYear() !== 1970)).toBe(true);
  });

  test("CLI arguments: dry run by default, --export-since needs a valid time", () => {
    expect(parseArgs([]).mode).toBe("--dry-run");
    expect(parseArgs(["--verify", "--json"])).toMatchObject({ mode: "--verify", json: true });
    expect(parseArgs(["--export-since", "2026-10-20T14:00:00Z"]).since.toISOString()).toBe("2026-10-20T14:00:00.000Z");
    expect(() => parseArgs(["--export-since", "yesterday-ish"])).toThrow(/needs a time/);
  });
});

const describeDb = TEST_DB ? describe : describe.skip;
jest.setTimeout(30000);

describeDb("ledger move: copy, verify and re-run against Postgres", () => {
  let prisma;
  beforeAll(() => {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => prisma.$executeRawUnsafe("TRUNCATE trades, accounts"));

  test("copy then verify: every user's cash and holdings match to the cent; nothing of deleted users is copied", async () => {
    const { users, purchases, ids } = sampleMongo();
    const p = migration.plan(users, purchases);
    const results = await migration.apply(prisma, p);
    expect(results.map((r) => r.status)).toEqual(["created", "created", "created"]);
    expect(await prisma.trade.count()).toBe(13);
    const v = await migration.verify(prisma, p);
    expect(v.ok).toBe(true);
    expect(v.results.find((r) => r.userId === ids.alice)).toMatchObject({ cash: "99189.78", trades: 3, holdings: "AAPL 3, TSLA 1" });
    expect((await prisma.account.findUnique({ where: { userId: ids.carol } })).cash.toString()).toBe("100000");
    const t = await prisma.trade.findUnique({ where: { id: purchases[0]._id } });
    expect(t).toMatchObject({ userId: ids.alice, symbol: "AAPL" }); // same id as in MongoDB: event links stay valid
    expect(t.behaviorCheckedAt.toISOString()).toBe(day(1, 16).toISOString());
  });

  test("running it twice is safe: nothing duplicated, still matching", async () => {
    const { users, purchases } = sampleMongo();
    const p = migration.plan(users, purchases);
    await migration.apply(prisma, p);
    const again = await migration.apply(prisma, p);
    expect(again.every((r) => r.status === "updated" && r.tradesCopied === 0)).toBe(true);
    expect(await prisma.trade.count()).toBe(13);
    expect((await migration.verify(prisma, p)).ok).toBe(true);
  });

  test("a re-run picks up trades and checked marks added in MongoDB since the last run", async () => {
    const { users, purchases, ids } = sampleMongo();
    await migration.apply(prisma, migration.plan(users, purchases));
    purchases[1].behaviorCheckedAt = day(2, 18);
    purchases.push(trade(ids.carol, "AAPL", 1, 100, "buy", 9));
    users[2].cashBalance = 99900;
    const p2 = migration.plan(users, purchases);
    expect((await migration.verify(prisma, p2)).ok).toBe(false);
    await migration.apply(prisma, p2);
    expect((await migration.verify(prisma, p2)).ok).toBe(true);
  });

  test("verify catches a one-cent difference and a missing trade, and says which user", async () => {
    const { users, purchases, ids } = sampleMongo();
    const p = migration.plan(users, purchases);
    await migration.apply(prisma, p);
    await prisma.$executeRaw`UPDATE accounts SET cash = cash - 0.01 WHERE user_id = ${ids.bob}`;
    await prisma.trade.delete({ where: { id: purchases[0]._id } });
    const v = await migration.verify(prisma, p);
    expect(v.ok).toBe(false);
    const bob = v.results.find((r) => r.userId === ids.bob);
    expect(bob.mismatches).toEqual(["cash: MongoDB 99899.90 vs Postgres 99899.89"]);
    const alice = v.results.find((r) => r.userId === ids.alice);
    expect(alice.mismatches).toEqual(expect.arrayContaining(["1 trade(s) missing in Postgres", "AAPL: 3 shares in MongoDB vs 0 in Postgres", "checked trades: 1 vs 0"]));
  });

  test("never overwrites a user who already traded on Postgres (post-cutover trade): conflict, cash untouched", async () => {
    const { users, purchases, ids } = sampleMongo();
    await migration.apply(prisma, migration.plan(users, purchases));
    await prisma.account.update({ where: { userId: ids.bob }, data: { cash: { decrement: 50 } } });
    await prisma.trade.create({ data: { id: oid(), userId: ids.bob, symbol: "AAPL", side: "buy", quantity: 1, price: 50, total: 50 } });
    const results = await migration.apply(prisma, migration.plan(users, purchases));
    expect(results.find((r) => r.userId === ids.bob)).toMatchObject({ status: "conflict" });
    expect((await prisma.account.findUnique({ where: { userId: ids.bob } })).cash.toFixed(2)).toBe("99849.90");
  });

  test("blocking problems stop the copy before anything is written", async () => {
    const u = oid();
    const p = migration.plan([{ _id: u, cashBalance: 100 }], [trade(u, "AAPL", 0.5, 10, "buy", 1)]);
    await expect(migration.apply(prisma, p)).rejects.toThrow(/Refusing to migrate: 1 blocking problem/);
    expect(await prisma.account.count()).toBe(0);
  });

  test("--export-since lists the Postgres trades a rollback to MongoDB would be missing", async () => {
    const { users, purchases, ids } = sampleMongo();
    await migration.apply(prisma, migration.plan(users, purchases));
    const cutover = new Date("2026-10-20T14:00:00Z");
    const id = oid();
    await prisma.trade.create({ data: { id, userId: ids.alice, symbol: "MSFT", side: "buy", quantity: 1, price: 400, total: 400, executedAt: new Date("2026-10-20T15:00:00Z") } });
    expect((await migration.tradesSince(prisma, cutover)).map((t) => t.id)).toEqual([id]);
  });

  test("after the move the Postgres ledger shows the same portfolio as the MongoDB one", async () => {
    const { createLedgerStore } = require("../src/lib/ledgerStore");
    const { createMongoLedgerStore } = require("../src/lib/ledgerStore.mongo");
    const { buildHoldings } = require("../src/lib/portfolio");
    const { users, purchases, ids } = sampleMongo();
    await migration.apply(prisma, migration.plan(users, purchases));

    const User = { findById: async (id) => users.find((u) => String(u._id) === String(id)) || null };
    const quotes = { getQuote: async () => ({ c: 100 }), getQuotes: async (s) => Object.fromEntries(s.map((x) => [x, { c: 200 }])) };
    const mongoTrades = (userId) => purchases.filter((t) => String(t.userId) === String(userId));
    const mongoStore = {
      ...createMongoLedgerStore({ User, Purchase: {} }),
      getAccount: async (userId) => { const u = await User.findById(userId); return { cashBalance: Math.round(u.cashBalance * 100) / 100, totalDeposited: 100000 }; },
      listTrades: async (userId) => mongoTrades(userId),
    };
    const pgStore = createLedgerStore({ backend: "postgres", User, Purchase: null, prisma });
    const summaryVia = async (store) => {
      const { createLedger } = require("../src/lib/ledger");
      return createLedger({ store, quotes }).summary(ids.alice);
    };
    const [before, after] = [await summaryVia(mongoStore), await summaryVia(pgStore)];
    expect(after).toEqual(before);
    expect(buildHoldings(await pgStore.listTrades(ids.alice, { order: "asc" }))).toEqual(buildHoldings(mongoTrades(ids.alice)));
  });
});

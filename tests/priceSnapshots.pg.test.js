// price_snapshots against a real Postgres (Phase 3, PR F): the database refuses bad rows, a repeat run for the
// same stock and day keeps one row, and recent() returns the newest closes oldest-first, which is what rule v3
// reads. Skipped unless TEST_DATABASE_URL is set (CI sets it and REQUIRE_PG_TESTS=1, so it can't silently skip).
const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB && process.env.REQUIRE_PG_TESTS === "1") throw new Error("REQUIRE_PG_TESTS=1 but TEST_DATABASE_URL is not set");
const describeDb = TEST_DB ? describe : describe.skip;
jest.setTimeout(30000);

describeDb("price_snapshots (Postgres)", () => {
  let prisma;
  let store;
  const rules = require("../src/lib/behaviorRules");

  beforeAll(() => {
    const { PrismaClient } = require("@prisma/client");
    const { createPgSnapshotStore } = require("../src/lib/priceSnapshots");
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB } } });
    store = createPgSnapshotStore({ prisma });
  });
  afterAll(() => prisma.$disconnect());
  beforeEach(() => prisma.$executeRawUnsafe("TRUNCATE price_snapshots"));

  test("the database refuses a zero/negative close, a non-ticker symbol and an unknown source", async () => {
    const insert = (symbol, close, source = "finnhub") =>
      prisma.$executeRawUnsafe(`INSERT INTO price_snapshots (symbol, trading_date, close, source) VALUES ('${symbol}', '2026-10-12', ${close}, '${source}')`);
    await expect(insert("AAPL", 0)).rejects.toThrow(/price_snapshots_close_positive/);
    await expect(insert("AAPL", -1)).rejects.toThrow(/price_snapshots_close_positive/);
    await expect(insert("aapl", 10)).rejects.toThrow(/price_snapshots_symbol_is_ticker/);
    await expect(insert("AAPL", 10, "guess")).rejects.toThrow(/price_snapshots_source_valid/);
    await expect(insert("BRK.B", 10)).resolves.toBe(1);
  });

  test("same stock and day twice: one row, the latest close (re-runs and holidays never duplicate)", async () => {
    expect(await store.save({ symbol: "AAPL", tradingDate: "2026-10-09", close: 100.5 })).toEqual({ created: true });
    expect(await store.save({ symbol: "AAPL", tradingDate: "2026-10-09", close: 101.25 })).toEqual({ created: false });
    const rows = await prisma.priceSnapshot.findMany({ where: { symbol: "AAPL" } });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].close)).toBe(101.25);
  });

  test("recent(): newest closes, oldest first, exact to 4 decimals; feeds rule v3", async () => {
    const days = ["2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-12"];
    for (const [i, d] of days.entries()) await store.save({ symbol: "MSFT", tradingDate: d, close: 400 + i * 0.1234 });
    await store.save({ symbol: "OTHER", tradingDate: "2026-10-12", close: 1 });
    const six = await store.recent("MSFT", 6);
    expect(six.map((r) => r.tradingDate)).toEqual(days.slice(1));
    expect(six[0].close).toBe(400.1234);
    expect(rules.fiveDayFromSnapshots(six, "2026-10-12")).toEqual({ fiveDayReturn: 0.15, asOf: "2026-10-12" });
  });
});

-- Phase 3 PR F: daily closing prices saved by the nightly job (one row per stock per trading day; repeat runs
-- update the same row). Rule v3 of the Behavioral Mirror reads the 5-day move from here.
-- CreateTable
CREATE TABLE "price_snapshots" (
    "symbol" VARCHAR(10) NOT NULL,
    "trading_date" DATE NOT NULL,
    "close" DECIMAL(14,4) NOT NULL,
    "source" VARCHAR(16) NOT NULL DEFAULT 'finnhub',
    "captured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("symbol","trading_date")
);

-- Rules the database itself enforces (hand-added: Prisma can't model CHECK constraints).
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_close_positive" CHECK ("close" > 0);
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_symbol_is_ticker" CHECK ("symbol" ~ '^[A-Z.]{1,10}$');
ALTER TABLE "price_snapshots" ADD CONSTRAINT "price_snapshots_source_valid" CHECK ("source" IN ('finnhub'));

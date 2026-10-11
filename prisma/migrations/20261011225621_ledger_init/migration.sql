-- CreateTable
CREATE TABLE "accounts" (
    "user_id" VARCHAR(24) NOT NULL,
    "cash" DECIMAL(14,2) NOT NULL,
    "total_deposited" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "trades" (
    "id" CHAR(24) NOT NULL,
    "user_id" VARCHAR(24) NOT NULL,
    "symbol" VARCHAR(10) NOT NULL,
    "side" VARCHAR(4) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,
    "price_source" VARCHAR(6) NOT NULL DEFAULT 'live',
    "behavior_checked_at" TIMESTAMPTZ(3),
    "idempotency_key" VARCHAR(100),
    "executed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trades_user_id_executed_at_idx" ON "trades"("user_id", "executed_at");

-- CreateIndex
CREATE UNIQUE INDEX "trades_user_id_idempotency_key_key" ON "trades"("user_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "accounts"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Rules the database itself enforces (Prisma can't model CHECK constraints). An impossible state is refused
-- here even if application code has a bug.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_cash_non_negative" CHECK ("cash" >= 0);
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_total_deposited_non_negative" CHECK ("total_deposited" >= 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_price_positive" CHECK ("price" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_total_positive" CHECK ("total" > 0);
ALTER TABLE "trades" ADD CONSTRAINT "trades_side_valid" CHECK ("side" IN ('buy', 'sell'));
ALTER TABLE "trades" ADD CONSTRAINT "trades_price_source_valid" CHECK ("price_source" IN ('live', 'client'));
ALTER TABLE "trades" ADD CONSTRAINT "trades_id_is_object_id" CHECK ("id" ~ '^[0-9a-f]{24}$');
ALTER TABLE "trades" ADD CONSTRAINT "trades_user_id_is_object_id" CHECK ("user_id" ~ '^[0-9a-f]{24}$');
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_is_object_id" CHECK ("user_id" ~ '^[0-9a-f]{24}$');

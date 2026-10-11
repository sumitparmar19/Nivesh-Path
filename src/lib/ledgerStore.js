// Picks the ledger store for LEDGER_BACKEND: "mongo" (default, today's ledger on the User document and the
// `purchases` collection) or "postgres" (Phase 3: `accounts` + `trades` via Prisma). A user's first Postgres
// account is opened with their MongoDB balance, so a user missed by the cutover script keeps their cash.
const { createMongoLedgerStore, STARTING_CASH } = require("./ledgerStore.mongo");

const BACKENDS = ["mongo", "postgres"];

function createLedgerStore({ backend = "mongo", User, Purchase, prisma }) {
  if (!BACKENDS.includes(backend)) throw new Error(`LEDGER_BACKEND must be one of ${BACKENDS.join(", ")} (got "${backend}")`);
  if (backend === "mongo") return createMongoLedgerStore({ User, Purchase });
  const { createPgLedgerStore } = require("./ledgerStore.pg");
  const { getPrisma } = require("./db");
  const store = createPgLedgerStore({
    prisma: prisma || getPrisma(),
    seedAccount: async (userId) => {
      const user = await User.findById(userId);
      if (!user) return null;
      return { cash: user.cashBalance ?? STARTING_CASH, totalDeposited: user.totalDeposited ?? STARTING_CASH };
    },
  });
  // Deleting an account also removes the user's pre-cutover MongoDB trades (kept only as a rollback copy).
  const deletePg = store.deleteUser;
  store.deleteUser = async (userId) => {
    await deletePg(userId);
    if (Purchase) await Purchase.deleteMany({ userId });
  };
  return store;
}

module.exports = { createLedgerStore, BACKENDS };

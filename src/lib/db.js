// Shared Prisma client for the Postgres ledger, created on first use so the app (and every test) runs without
// Postgres or a generated client while LEDGER_BACKEND=mongo. One client per process: it holds the connection pool.
let client = null;

function getPrisma() {
  if (!client) {
    const { PrismaClient } = require("@prisma/client");
    client = new PrismaClient();
  }
  return client;
}

async function disconnectPrisma() {
  if (client) {
    const c = client;
    client = null;
    await c.$disconnect();
  }
}

module.exports = { getPrisma, disconnectPrisma };

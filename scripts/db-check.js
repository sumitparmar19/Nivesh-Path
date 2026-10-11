// Postgres ledger connection check: `node scripts/db-check.js` (DigitalOcean Console, CI, local).
// Runs one Prisma query and prints the migration state, row counts and the server version; exits 1 on failure.
// Prints no connection strings or user data.
const { PrismaClient } = require("@prisma/client");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const prisma = new PrismaClient();
  try {
    const [{ version }] = await prisma.$queryRaw`SELECT version()`;
    const migrations = await prisma.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at`;
    const [accounts, trades] = await Promise.all([prisma.account.count(), prisma.trade.count()]);
    console.log(JSON.stringify({
      ok: true,
      server: String(version).split(" ").slice(0, 2).join(" "),
      migrations: migrations.map((m) => m.migration_name),
      accounts,
      trades,
    }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(`Ledger database check failed: ${err.message}`);
  process.exit(1);
});

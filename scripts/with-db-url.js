#!/usr/bin/env node
// Runs a command with DATABASE_URL/DIRECT_URL built from DB_HOST/DB_USER/DB_PASSWORD (src/lib/dbUrl.js). The AWS demo's
// one-off migration task uses it: `node scripts/with-db-url.js npx --no-install prisma migrate deploy`. Prisma's CLI
// reads the URL from the environment, and on AWS the RDS password arrives on its own (from Secrets Manager).
// When DATABASE_URL is already set (DigitalOcean, local), the command runs unchanged.
const { spawnSync } = require("child_process");
const { applyDatabaseUrl } = require("../src/lib/dbUrl");

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Usage: node scripts/with-db-url.js <command> [args...]");
  process.exit(2);
}
applyDatabaseUrl(process.env);
if (!process.env.DATABASE_URL) {
  console.error("Neither DATABASE_URL nor DB_HOST/DB_USER/DB_PASSWORD is set.");
  process.exit(2);
}
const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
if (result.error) {
  console.error(`Could not run ${cmd}: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status === null ? 1 : result.status);

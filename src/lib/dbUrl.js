// Builds DATABASE_URL (and DIRECT_URL) from separate DB_* variables when no URL is given. On AWS (infra/demo) RDS
// creates the master password itself and keeps it in Secrets Manager, and ECS hands it to the container as
// DB_PASSWORD. That password can contain characters that are not allowed raw in a URL, so the URL is assembled here,
// with every part percent-encoded, instead of in Terraform. DigitalOcean and local setups set DATABASE_URL directly,
// and then nothing changes.

/** The Postgres URL for DB_HOST/DB_USER/DB_PASSWORD (+ DB_PORT, DB_NAME), or null when it isn't needed or possible. */
function composeDatabaseUrl(env) {
  if (env.DATABASE_URL) return null;
  const { DB_HOST, DB_USER, DB_PASSWORD } = env;
  if (!DB_HOST || !DB_USER || !DB_PASSWORD) return null;
  const port = env.DB_PORT || "5432";
  const name = env.DB_NAME || "nivesh";
  const user = encodeURIComponent(DB_USER);
  const password = encodeURIComponent(DB_PASSWORD);
  // sslmode=require: RDS accepts only encrypted connections (rds.force_ssl is on by default for Postgres 15+).
  return `postgresql://${user}:${password}@${DB_HOST}:${port}/${encodeURIComponent(name)}?sslmode=require`;
}

/** Sets DATABASE_URL (and DIRECT_URL, unless already set) from DB_* when needed. Returns true if it set them. */
function applyDatabaseUrl(env = process.env) {
  const url = composeDatabaseUrl(env);
  if (!url) return false;
  env.DATABASE_URL = url;
  if (!env.DIRECT_URL) env.DIRECT_URL = url;
  return true;
}

module.exports = { composeDatabaseUrl, applyDatabaseUrl };

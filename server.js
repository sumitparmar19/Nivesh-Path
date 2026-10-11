// Entry point: connects MongoDB, wires optional Sentry, picks the ledger (LEDGER_BACKEND), and starts the HTTP server.
const mongoose = require("mongoose");
const { config } = require("./src/config");
const { createApp } = require("./src/app");

let onError;
if (config.sentryDsn) {
  const Sentry = require("@sentry/node");
  Sentry.init({ dsn: config.sentryDsn, tracesSampleRate: 0.2 });
  onError = (err) => Sentry.captureException(err);
}

async function start() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    console.error("JWT_SECRET must be set in production - refusing to start with the dev secret.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.FAKE_MARKET_DATA === "1") {
    console.error("FAKE_MARKET_DATA is for automated tests only - refusing to show made-up prices in production.");
    process.exit(1);
  }
  const { BACKENDS } = require("./src/lib/ledgerStore");
  if (!BACKENDS.includes(config.ledgerBackend)) {
    console.error(`LEDGER_BACKEND must be one of ${BACKENDS.join(", ")} (got "${config.ledgerBackend}") - refusing to start.`);
    process.exit(1);
  }
  if (config.ledgerBackend === "postgres" && !config.databaseUrl) {
    console.error("LEDGER_BACKEND=postgres needs DATABASE_URL - refusing to start rather than lose track of cash.");
    process.exit(1);
  }
  console.log(`Ledger: ${config.ledgerBackend}${process.env.LEDGER_MAINTENANCE === "1" ? " (maintenance: trading paused)" : ""}`);

  let mongoReady = false;
  if (config.mongoUrl) {
    try {
      await mongoose.connect(config.mongoUrl);
      console.log("MongoDB connected");
      mongoReady = true;
    } catch (err) {
      console.error("MongoDB connection failed:", err.message);
    }
  } else {
    console.warn("MONGO_URL is not set - transactions and auth will not work");
  }

  const app = createApp({ onError });
  if (mongoReady) {
    // Re-check Behavioral Mirror events saved under older rules (repeat-safe; runs in the background).
    const { migrateBehaviorEvents } = require("./src/lib/behaviorMigration");
    migrateBehaviorEvents({ BehaviorEvent: require("./src/models/BehaviorEvent"), ledgerStore: app.locals.ledgerStore });
  }
  const server = app.listen(config.port, () => {
    console.log(`Nivesh-Path running on http://localhost:${config.port}`);
  });

  // Deploys stop the old container with SIGTERM: finish in-flight requests, then close the database pools.
  process.once("SIGTERM", () => {
    server.close(async () => {
      await require("./src/lib/db").disconnectPrisma().catch(() => {});
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

start();

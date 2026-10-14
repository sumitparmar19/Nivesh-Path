// Entry point: connects MongoDB, wires optional Sentry, picks the ledger (LEDGER_BACKEND), and starts the HTTP server.
// OpenTelemetry must load before anything else so it can instrument http/express/mongodb/redis/fetch (no-op unless
// OTEL_EXPORTER_OTLP_ENDPOINT is set).
const telemetry = require("./src/telemetry");
// AWS demo: RDS hands over host/user/password separately; build DATABASE_URL before config.js reads it.
require("./src/lib/dbUrl").applyDatabaseUrl(process.env);
const mongoose = require("mongoose");
const { config } = require("./src/config");
const { createApp } = require("./src/app");
const { logger } = require("./src/lib/logger");

let onError;
if (config.sentryDsn) {
  const Sentry = require("@sentry/node");
  // Sentry 11 doesn't register its own OpenTelemetry provider (enableOpenTelemetrySetup defaults to false), so it
  // can't compete with src/telemetry.js: Sentry reports errors, OpenTelemetry owns tracing.
  Sentry.init({ dsn: config.sentryDsn, tracesSampleRate: 0.2 });
  onError = (err) => Sentry.captureException(err);
}

async function start() {
  if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
    logger.fatal("JWT_SECRET must be set in production - refusing to start with the dev secret.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && process.env.FAKE_MARKET_DATA === "1") {
    logger.fatal("FAKE_MARKET_DATA is for automated tests only - refusing to show made-up prices in production.");
    process.exit(1);
  }
  const { BACKENDS } = require("./src/lib/ledgerStore");
  if (!BACKENDS.includes(config.ledgerBackend)) {
    logger.fatal(`LEDGER_BACKEND must be one of ${BACKENDS.join(", ")} (got "${config.ledgerBackend}") - refusing to start.`);
    process.exit(1);
  }
  if (config.ledgerBackend === "postgres" && !config.databaseUrl) {
    logger.fatal("LEDGER_BACKEND=postgres needs DATABASE_URL - refusing to start rather than lose track of cash.");
    process.exit(1);
  }
  logger.info(`Ledger: ${config.ledgerBackend}${process.env.LEDGER_MAINTENANCE === "1" ? " (maintenance: trading paused)" : ""}`);

  let mongoReady = false;
  if (config.mongoUrl) {
    try {
      await mongoose.connect(config.mongoUrl);
      logger.info("MongoDB connected");
      mongoReady = true;
    } catch (err) {
      logger.error("MongoDB connection failed: %s", err.message);
    }
  } else {
    logger.warn("MONGO_URL is not set - transactions and auth will not work");
  }

  const app = createApp({ onError });
  logger.info(telemetry.startupLine());
  // One Finnhub call at start-up, so What's new shows a rejected key right away (not only in the logs).
  if (app.locals.quotes && app.locals.quotes.checkKey) {
    app.locals.quotes.checkKey().then((h) => logger.info(`Market data: ${h.status}${h.httpStatus ? ` (HTTP ${h.httpStatus})` : ""}`));
  }
  if (telemetry.enabled) require("./src/lib/metrics").watchAiService(app.locals.aiClient);
  if (mongoReady) {
    // Re-check Behavioral Mirror events saved under older rules (repeat-safe; runs in the background).
    const { migrateBehaviorEvents } = require("./src/lib/behaviorMigration");
    migrateBehaviorEvents({
      BehaviorEvent: require("./src/models/BehaviorEvent"),
      ledgerStore: app.locals.ledgerStore,
      log: { log: (m) => logger.info(m), warn: (m) => logger.warn(m) },
    });
  }
  const server = app.listen(config.port, () => {
    logger.info(`Nivesh-Path running on http://localhost:${config.port}`);
  });

  // Deploys stop the old container with SIGTERM: finish in-flight requests, then close the database pools.
  process.once("SIGTERM", () => {
    server.closeIdleConnections(); // keep-alive sockets (e.g. the AI service's client) would hold close() open
    server.close(async () => {
      await require("./src/lib/db").disconnectPrisma().catch(() => {});
      await telemetry.shutdown();
      await mongoose.disconnect().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10000).unref();
  });
}

start();

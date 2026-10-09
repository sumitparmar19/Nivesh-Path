// Entry point: connects MongoDB, wires optional Sentry, and starts the HTTP server.
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
  if (config.mongoUrl) {
    try {
      await mongoose.connect(config.mongoUrl);
      console.log("MongoDB connected");
      // Re-check Behavioral Mirror events saved under older rules (repeat-safe; runs in the background).
      const { migrateBehaviorEvents } = require("./src/lib/behaviorMigration");
      migrateBehaviorEvents({ BehaviorEvent: require("./src/models/BehaviorEvent"), Purchase: require("./models/Stock1") });
    } catch (err) {
      console.error("MongoDB connection failed:", err.message);
    }
  } else {
    console.warn("MONGO_URL is not set - transactions and auth will not work");
  }

  const app = createApp({ onError });
  app.listen(config.port, () => {
    console.log(`Nivesh-Path running on http://localhost:${config.port}`);
  });
}

start();

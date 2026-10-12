// Structured JSON logger (pino) for the web service. With telemetry on, every line carries trace_id/span_id
// (added by the pino instrumentation in src/telemetry.js) and is also exported to Grafana over OTLP.
// Credentials, emails and bodies are never logged: known secret keys are censored by path, and string fields go
// through the same scrubber as spans. LOG_LEVEL sets the level; tests default to "silent".
const pino = require("pino");
const { redactString } = require("./redact");

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID ? "silent" : "info");

const logger = pino({
  level,
  base: { service: process.env.OTEL_SERVICE_NAME || "nivesh-web" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: ["authorization", "password", "token", "apiKey", "cookie", "req.headers", "*.authorization", "*.password", "*.token", "email", "*.email"],
    censor: "[REDACTED]",
  },
  formatters: { level: (label) => ({ level: label }) },
  hooks: {
    // Messages are scrubbed too (e.g. an error message that echoes a URL with ?token=).
    logMethod(args, method) {
      return method.apply(this, args.map((a) => (typeof a === "string" ? redactString(a) : a)));
    },
  },
});

/** Express middleware: one JSON line per API request (method, route template, status, duration). Never bodies. */
function requestLog(routeOf) {
  return (req, res, next) => {
    if (!req.path.startsWith("/api/") && !req.path.startsWith("/internal") && !req.path.startsWith("/store-purchase")) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const ms = Math.round(Number(process.hrtime.bigint() - start) / 1e5) / 10;
      const entry = { method: req.method, route: routeOf(req), status: res.statusCode, ms };
      if (res.statusCode >= 500) logger.error(entry, "request failed");
      else logger.info(entry, "request");
    });
    next();
  };
}

module.exports = { logger, requestLog };

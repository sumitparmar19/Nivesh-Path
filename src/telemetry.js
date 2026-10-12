// OpenTelemetry for the web service: traces, metrics and logs exported over OTLP (Grafana Cloud in production).
// It is OFF unless OTEL_EXPORTER_OTLP_ENDPOINT is set: then nothing is loaded and every metric/span call is a no-op.
// server.js requires this file first, because instrumentations must patch http/express/mongodb/redis/fetch before
// those modules are loaded. Only the instrumentations this app uses are loaded (the 0.5 GB web instance counts),
// and every span passes through a redacting exporter: no JWTs, API keys, tokens, emails or bodies leave the process.
// Standard variables: OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS, OTEL_SERVICE_NAME,
// OTEL_RESOURCE_ATTRIBUTES (see docs/OBSERVABILITY.md).
require("dotenv").config(); // runs before src/config.js, which normally loads .env
const { redactAttributes, redactString } = require("./lib/redact");

const enabled = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT) && process.env.OTEL_SDK_DISABLED !== "true";
let shutdownFns = [];

/** Wraps an exporter so every span is scrubbed (attributes, event attributes, status message) before export. */
function redactingSpanExporter(inner) {
  const scrub = (span) =>
    Object.create(span, {
      attributes: { value: redactAttributes(span.attributes), enumerable: true },
      events: {
        value: (span.events || []).map((e) => ({ ...e, attributes: redactAttributes(e.attributes) })),
        enumerable: true,
      },
      status: {
        value: span.status && span.status.message ? { ...span.status, message: redactString(span.status.message) } : span.status,
        enumerable: true,
      },
    });
  return {
    export: (spans, done) => inner.export(spans.map(scrub), done),
    shutdown: () => inner.shutdown(),
    forceFlush: () => (inner.forceFlush ? inner.forceFlush() : Promise.resolve()),
  };
}

function start() {
  const { diag, DiagConsoleLogger, DiagLogLevel } = require("@opentelemetry/api");
  const { logs } = require("@opentelemetry/api-logs");
  const { resourceFromAttributes, defaultResource } = require("@opentelemetry/resources");
  const { NodeTracerProvider } = require("@opentelemetry/sdk-trace-node");
  const { BatchSpanProcessor } = require("@opentelemetry/sdk-trace-base");
  const { MeterProvider, PeriodicExportingMetricReader } = require("@opentelemetry/sdk-metrics");
  const { LoggerProvider, BatchLogRecordProcessor } = require("@opentelemetry/sdk-logs");
  const { OTLPTraceExporter } = require("@opentelemetry/exporter-trace-otlp-proto");
  const { OTLPMetricExporter } = require("@opentelemetry/exporter-metrics-otlp-proto");
  const { OTLPLogExporter } = require("@opentelemetry/exporter-logs-otlp-proto");
  const { metrics } = require("@opentelemetry/api");
  const { registerInstrumentations } = require("@opentelemetry/instrumentation");
  const { HttpInstrumentation } = require("@opentelemetry/instrumentation-http");
  const { ExpressInstrumentation } = require("@opentelemetry/instrumentation-express");
  const { MongoDBInstrumentation } = require("@opentelemetry/instrumentation-mongodb");
  const { RedisInstrumentation } = require("@opentelemetry/instrumentation-redis");
  const { UndiciInstrumentation } = require("@opentelemetry/instrumentation-undici");
  const { PinoInstrumentation } = require("@opentelemetry/instrumentation-pino");
  const { PrismaInstrumentation } = require("@prisma/instrumentation");

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.WARN);
  const resource = defaultResource().merge(
    resourceFromAttributes({ "service.name": process.env.OTEL_SERVICE_NAME || "nivesh-web", "service.namespace": "nivesh-path" })
  );

  // Standard switches: OTEL_TRACES_EXPORTER / OTEL_METRICS_EXPORTER / OTEL_LOGS_EXPORTER = "none" turn one signal off
  // (the load test sends metrics only); OTEL_METRIC_EXPORT_INTERVAL in ms (default 30 s).
  const on = (signal) => (process.env[`OTEL_${signal}_EXPORTER`] || "otlp").toLowerCase() !== "none";
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: on("TRACES") ? [new BatchSpanProcessor(redactingSpanExporter(new OTLPTraceExporter()))] : [],
  });
  tracerProvider.register(); // W3C trace context: outgoing calls to the AI service carry `traceparent`

  const meterProvider = new MeterProvider({
    resource,
    readers: on("METRICS")
      ? [new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter(), exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL) || 30000 })]
      : [],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  // sdk-logs 0.2xx takes an options object ({ exporter }); passing the exporter itself left it undefined and every
  // log batch threw "Cannot read properties of undefined (reading 'export')" (tests/telemetryLogExport.test.js).
  const loggerProvider = new LoggerProvider({
    resource,
    processors: on("LOGS") ? [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter() })] : [],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  const ignored = (path) => path === "/health" || path.startsWith("/assets/") || /\.(js|css|png|svg|ico|woff2?|map)$/.test(path);
  registerInstrumentations({
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => ignored((req.url || "").split("?")[0]),
        // Only the request line and status are recorded; headers are never captured.
      }),
      new ExpressInstrumentation({ ignoreLayersType: ["middleware"] }),
      new MongoDBInstrumentation({ enhancedDatabaseReporting: false }), // query values become "?"
      new RedisInstrumentation(),
      new UndiciInstrumentation(), // fetch(): Finnhub, the AI service, Resend
      new PinoInstrumentation(), // trace_id/span_id in every log line, and logs exported over OTLP
      new PrismaInstrumentation(),
    ],
  });

  shutdownFns = [() => tracerProvider.shutdown(), () => meterProvider.shutdown(), () => loggerProvider.shutdown()];
}

if (enabled) {
  try {
    start();
  } catch (err) {
    // Telemetry must never stop the site from starting.
    console.error(`OpenTelemetry disabled: ${err.message}`);
  }
}

/** Flush and stop exporters (SIGTERM). */
async function shutdown() {
  await Promise.allSettled(shutdownFns.map((fn) => fn()));
}

module.exports = { enabled, shutdown, redactingSpanExporter };

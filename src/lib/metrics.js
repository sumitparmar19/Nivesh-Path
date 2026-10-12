// Application metrics for the web service (Phase 3 observability), shown on observability/grafana-dashboard.json.
// Built on the OpenTelemetry API: until src/telemetry.js registers a MeterProvider (only when
// OTEL_EXPORTER_OTLP_ENDPOINT is set) every instrument here is a no-op, so tests and local runs pay nothing.
// Attribute values are kept low-cardinality (route templates, never raw URLs or user ids).
const { metrics } = require("@opentelemetry/api");

const meter = () => metrics.getMeter("nivesh-web");
let instruments = null;

// Created on first use, after telemetry.js has (or hasn't) installed a real MeterProvider.
function get() {
  if (instruments) return instruments;
  const m = meter();
  instruments = {
    httpDuration: m.createHistogram("nivesh.http.server.duration", {
      description: "Time to answer an HTTP request, by route template",
      unit: "s",
      advice: { explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 5, 10] },
    }),
    trades: m.createCounter("nivesh.trades", { description: "Orders placed (replayed retries counted separately)", unit: "{trade}" }),
    detections: m.createCounter("nivesh.behavior.detections", { description: "Behavioral Mirror patterns detected", unit: "{event}" }),
    cache: m.createCounter("nivesh.cache.requests", { description: "Cache lookups by cache and result (hit/miss)", unit: "{request}" }),
    aiDuration: m.createHistogram("nivesh.ai.request.duration", {
      description: "Calls from the web service to the AI service",
      unit: "s",
      advice: { explicitBucketBoundaries: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 40, 60] },
    }),
  };
  return instruments;
}

const statusClass = (code) => `${Math.floor(Number(code) / 100)}xx`;

/** Express middleware: one histogram point per request, labelled by the matched route template. */
function httpMetrics(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const seconds = Number(process.hrtime.bigint() - start) / 1e9;
    get().httpDuration.record(seconds, {
      "http.route": routeOf(req),
      "http.request.method": req.method,
      "http.response.status_class": statusClass(res.statusCode),
    });
  });
  next();
}

/** The route template ("/api/stocks/:symbol/quote"), or a coarse bucket for unmatched paths (static files, SPA). */
function routeOf(req) {
  if (req.route && req.route.path) {
    // A route can answer several paths (aliases): label it with the one that was called when it's a plain path.
    const paths = Array.isArray(req.route.path) ? req.route.path.map(String) : [String(req.route.path)];
    const path = paths.find((p) => `${req.baseUrl || ""}${p}` === req.path) || paths[0];
    return `${req.baseUrl || ""}${path}`;
  }
  if (req.path.startsWith("/api/")) return "/api/(unmatched)";
  if (req.path.startsWith("/internal")) return "/internal/(unmatched)";
  return "(static or page)";
}

const recordTrade = (side, outcome) => get().trades.add(1, { side, outcome });
const recordDetection = (patternType, severity) => get().detections.add(1, { pattern_type: patternType, severity });
const recordCache = (cacheName, hit) => get().cache.add(1, { cache: cacheName, result: hit ? "hit" : "miss" });
const recordAiCall = (operation, seconds, outcome) => get().aiDuration.record(seconds, { operation, outcome });

/**
 * ai_service_up (1/0): the web service's view of the AI service, polled every 60 s, so Grafana can alert on it.
 * Only started when telemetry is on.
 */
function watchAiService(aiClient, intervalMs = 60000) {
  let up = 0;
  const check = () => aiClient.health().then(() => { up = 1; }, () => { up = 0; });
  check();
  const timer = setInterval(check, intervalMs);
  timer.unref();
  meter()
    .createObservableGauge("nivesh.ai.service.up", { description: "1 when the AI service answers its health check, else 0" })
    .addCallback((result) => result.observe(up));
  return () => clearInterval(timer);
}

module.exports = { httpMetrics, routeOf, recordTrade, recordDetection, recordCache, recordAiCall, watchAiService, statusClass };

// Observability tests (Phase 3, PR C): telemetry is off by default, nothing secret or personal leaves in spans,
// the cache switch used by the load test works, and real requests produce the dashboard's metrics.
process.env.JWT_SECRET = "test-secret";
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

const request = require("supertest");
const { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } = require("@opentelemetry/sdk-trace-base");
const { MeterProvider, MetricReader } = require("@opentelemetry/sdk-metrics");
const { metrics } = require("@opentelemetry/api");
const { redactAttributes, redactString } = require("../src/lib/redact");

describe("telemetry is off unless OTEL_EXPORTER_OTLP_ENDPOINT is set", () => {
  test("no endpoint: disabled, nothing registered", () => {
    jest.isolateModules(() => {
      expect(require("../src/telemetry").enabled).toBe(false);
    });
  });

  test("the start-up line names the service (a copied OTEL_SERVICE_NAME showed as 'Services 1' on live)", () => {
    jest.isolateModules(() => {
      expect(require("../src/telemetry").startupLine()).toBe("Telemetry: off (OTEL_EXPORTER_OTLP_ENDPOINT not set)");
    });
    const saved = process.env.OTEL_SERVICE_NAME;
    process.env.OTEL_SERVICE_NAME = "nivesh-ai";
    try {
      jest.isolateModules(() => expect(require("../src/telemetry").serviceName).toBe("nivesh-ai"));
    } finally {
      if (saved === undefined) delete process.env.OTEL_SERVICE_NAME;
      else process.env.OTEL_SERVICE_NAME = saved;
    }
    const { startupLine } = require("../src/telemetry");
    expect(startupLine(true, "nivesh-web")).toBe("Telemetry: exporting over OTLP as nivesh-web");
  });
});

describe("redaction: no tokens, keys, passwords or emails in telemetry", () => {
  test("strings: Finnhub's ?token=, bearer tokens, connection-string passwords and emails are scrubbed", () => {
    expect(redactString("https://finnhub.io/api/v1/quote?symbol=AAPL&token=abc123secret")).toBe("https://finnhub.io/api/v1/quote?symbol=AAPL&token=[REDACTED]");
    expect(redactString("Authorization: Bearer eyJhbGciOi.eyJzdWIi.sig")).toBe("Authorization: Bearer [REDACTED]");
    expect(redactString("mongodb+srv://nivesh-live:TEST_PASSWORD@cluster0.abc.mongodb.net/db")).toBe("mongodb+srv://nivesh-live:[REDACTED]@cluster0.abc.mongodb.net/db");
    expect(redactString("postgresql://neondb_owner:TEST_PASSWORD@ep-x.neon.tech/neondb")).toBe("postgresql://neondb_owner:[REDACTED]@ep-x.neon.tech/neondb");
    expect(redactString("login failed for sumit@example.com")).toBe("login failed for [email]");
    expect(redactString("GET /api/stocks/AAPL/quote")).toBe("GET /api/stocks/AAPL/quote");
  });

  test("attributes: credential headers are dropped, other values scrubbed, safe ones kept", () => {
    expect(redactAttributes({
      "http.request.header.authorization": ["Bearer x"],
      "http.request.header.cookie": "sid=1",
      "http.request.header.x-internal-token": "t",
      "http.request.header.idempotency-key": "k",
      "url.full": "https://finnhub.io/api/v1/stock/metric?symbol=TSLA&metric=all&token=SECRET",
      "enduser.email": "a@b.co",
      "http.route": "/api/stocks/:symbol/quote",
      "http.response.status_code": 200,
    })).toEqual({
      "url.full": "https://finnhub.io/api/v1/stock/metric?symbol=TSLA&metric=all&token=[REDACTED]",
      "http.route": "/api/stocks/:symbol/quote",
      "http.response.status_code": 200,
    });
  });

  test("credential keys are dropped whether written with dashes or underscores", () => {
    expect(redactAttributes({
      "http.request.header.x_internal_token": "t",
      "x_internal_token": "t",
      "idempotency_key": "k",
      "order.idempotency_key": "k",
      "X-Internal-Token": "t",
      "http.route": "/internal/trades",
    })).toEqual({ "http.route": "/internal/trades" });
  });

  test("real spans go through the redacting exporter scrubbed, and keep their trace ids", async () => {
    const { redactingSpanExporter } = require("../src/telemetry");
    const memory = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(redactingSpanExporter(memory))] });
    const span = provider.getTracer("t").startSpan("GET finnhub", {
      attributes: { "url.full": "https://finnhub.io/api/v1/quote?symbol=AAPL&token=SECRET", "http.request.header.authorization": "Bearer abc" },
    });
    span.addEvent("exception", { "exception.message": "fetch https://x.io/?token=SECRET for bob@corp.com failed" });
    span.setStatus({ code: 2, message: "Bearer abc.def rejected" });
    const traceId = span.spanContext().traceId;
    span.end();
    const [out] = memory.getFinishedSpans();
    const all = JSON.stringify({ a: out.attributes, e: out.events, s: out.status });
    expect(all).not.toMatch(/SECRET|abc\.def|bob@corp\.com|Bearer abc/);
    expect(out.attributes["url.full"]).toContain("token=[REDACTED]");
    expect(out.attributes["http.request.header.authorization"]).toBeUndefined();
    expect(out.spanContext().traceId).toBe(traceId);
    expect(out.name).toBe("GET finnhub");
    await provider.shutdown();
  });
});

describe("cache switch for the load test (CACHE_DISABLED=1)", () => {
  test("disabled: every lookup misses; enabled: a stored value comes back", async () => {
    const { createCache } = require("../src/lib/cache");
    const off = createCache({ disabled: true });
    await off.set("quote:AAPL", { c: 1 }, 60);
    expect(await off.get("quote:AAPL")).toBeNull();
    const on = createCache({ disabled: false });
    await on.set("quote:AAPL", { c: 1 }, 60);
    expect(await on.get("quote:AAPL")).toEqual({ c: 1 });
  });
});

describe("metrics recorded by real requests", () => {
  class TestReader extends MetricReader {
    async onForceFlush() {}
    async onShutdown() {}
  }

  test("route-template latency, trades, cache hits/misses and AI call timings", async () => {
    const reader = new TestReader();
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    let collected;
    await new Promise((resolve, reject) => {
      jest.isolateModules(async () => {
        try {
          const { createApp } = require("../src/app");
          const { createCache } = require("../src/lib/cache");
          const { createAiClient } = require("../src/lib/aiClient");
          const users = [];
          const User = {
            findOne: async () => null,
            create: async (doc) => { const u = { _id: "0123456789abcdef0123456" + users.length, cashBalance: 100000, totalDeposited: 100000, ...doc }; users.push(u); return u; },
            findById: async (id) => users.find((u) => u._id === String(id)) || null,
            updateOne: async () => ({}),
            findOneAndUpdate: async (filter, update) => {
              const u = users.find((x) => x._id === String(filter._id));
              if (!u || (filter.cashBalance && u.cashBalance < filter.cashBalance.$gte)) return null;
              u.cashBalance += update.$inc.cashBalance;
              return u;
            },
          };
          const trades = [];
          const Purchase = {
            findOne: async () => null,
            create: async (doc) => { const t = { _id: `${trades.length}`.padStart(24, "a"), timestamp: new Date(), ...doc }; trades.push(t); return t; },
            find: () => ({ sort: () => ({ lean: async () => trades, limit: () => ({ lean: async () => trades }) }), lean: async () => trades }),
          };
          const aiFetch = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
          const app = createApp({
            User, Purchase, BehaviorEvent: null, detector: null, Analysis: null, Watchlist: null, Message: null,
            cache: createCache({ disabled: false }), fakeMarket: true,
            aiClient: createAiClient({ fetchImpl: aiFetch, baseUrl: "http://ai" }),
            mailer: { enabled: false, send: async () => false }, spa: { distDir: "/nonexistent" },
          });
          const reg = await request(app).post("/api/register").send({ name: "M", email: "m@x.io", mobile: "9999999999", password: "secret123" });
          const auth = { Authorization: `Bearer ${reg.body.token}` };
          await request(app).get("/api/stocks/AAPL/quote");
          await request(app).get("/api/stocks/AAPL/quote"); // second one is a cache hit
          await request(app).post("/api/trades").set(auth).send({ symbol: "AAPL", quantity: 1, type: "BUY" });
          collected = await reader.collect();
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
    const all = collected.resourceMetrics.scopeMetrics.flatMap((s) => s.metrics);
    const byName = Object.fromEntries(all.map((m) => [m.descriptor.name, m]));

    const routes = byName["nivesh.http.server.duration"].dataPoints.map((d) => d.attributes["http.route"]);
    expect(routes).toEqual(expect.arrayContaining(["/api/register", "/api/stocks/:symbol/quote", "/api/trades"]));
    expect(byName["nivesh.http.server.duration"].descriptor.unit).toBe("s");

    const trades = byName["nivesh.trades"].dataPoints;
    expect(trades).toEqual([expect.objectContaining({ attributes: { side: "buy", outcome: "filled" }, value: 1 })]);

    const cache = byName["nivesh.cache.requests"].dataPoints.map((d) => [d.attributes.cache, d.attributes.result, d.value]);
    expect(cache).toEqual(expect.arrayContaining([["quote", "hit", expect.any(Number)], ["quote", "miss", expect.any(Number)]]));

    const ai = byName["nivesh.ai.request.duration"].dataPoints.map((d) => d.attributes.operation);
    expect(ai).toContain("POST /api/ai/transactions");
    expect(JSON.stringify(all)).not.toMatch(/m@x\.io|Bearer/); // no personal data in metric labels
    metrics.disable();
    await provider.shutdown();
  });

  test("AI operation labels never contain user ids", () => {
    const { operationOf } = require("../src/lib/aiClient");
    expect(operationOf("GET", "/api/ai/memory/0123456789abcdef01234567")).toBe("GET /api/ai/memory/:userId");
    expect(operationOf("POST", "/api/ai/behavior/0123456789abcdef01234567")).toBe("POST /api/ai/behavior/:userId");
  });
});

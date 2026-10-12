// Sends one real log batch through src/telemetry.js's LoggerProvider -> BatchLogRecordProcessor -> OTLP exporter to a
// local HTTP receiver, and checks it arrives. The live site crashed on every log batch ("Cannot read properties of
// undefined (reading 'export')") because the processor was built with the old constructor signature; the unit tests
// never ran a real export, so nothing caught it. The export runs in a child `node` process, exactly as in production
// (the OTLP exporter uses dynamic import(), which Jest's module sandbox can't run).
const http = require("http");
const path = require("path");
const { execFile } = require("child_process");

const CHILD = `
const { setGlobalErrorHandler } = require("@opentelemetry/core");
const errors = [];
setGlobalErrorHandler((e) => errors.push(String(e && e.message ? e.message : e)));
const telemetry = require(${JSON.stringify(path.join(__dirname, "..", "src", "telemetry"))});
const { logs } = require("@opentelemetry/api-logs");
logs.getLogger("log-export-test").emit({ body: "log-export-check 42", severityText: "INFO" });
// The app's own logger (pino, instrumented by telemetry): its lines are exported too, already scrubbed.
require(${JSON.stringify(path.join(__dirname, "..", "src", "lib", "logger"))}).logger.info("pino-export-check for someone@example.com");
const report = (flushed) => { console.log(JSON.stringify({ enabled: telemetry.enabled, flushed, errors })); process.exit(0); };
setTimeout(() => report(false), 5000); // a broken processor never finishes flushing
telemetry.shutdown().then(() => report(true));
`;

function runChild(endpoint) {
  const env = {
    ...process.env,
    OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
    OTEL_TRACES_EXPORTER: "none",
    OTEL_METRICS_EXPORTER: "none",
    LOG_LEVEL: "info",
  };
  delete env.OTEL_LOGS_EXPORTER;
  delete env.OTEL_SDK_DISABLED;
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ["-e", CHILD], { env, cwd: path.join(__dirname, ".."), timeout: 20000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`child failed: ${err.message}\n${stderr}`));
      const last = stdout.trim().split("\n").pop();
      return resolve(JSON.parse(last));
    });
  });
}

describe("OpenTelemetry log export (real batch to a local OTLP receiver)", () => {
  let server;
  const received = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        received.push({ path: req.url, contentType: req.headers["content-type"], body: Buffer.concat(chunks) });
        res.writeHead(200, { "content-type": "application/x-protobuf" });
        res.end();
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  test("a log record is exported over OTLP without errors", async () => {
    const result = await runChild(`http://127.0.0.1:${server.address().port}`);
    expect(result.enabled).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.flushed).toBe(true);
    const batch = received.find((r) => r.path === "/v1/logs");
    expect(batch).toBeDefined();
    expect(batch.contentType).toBe("application/x-protobuf");
    const all = Buffer.concat(received.filter((r) => r.path === "/v1/logs").map((r) => r.body));
    expect(all.includes(Buffer.from("log-export-check 42"))).toBe(true);
    // pino lines reach the exporter, with the email already scrubbed by the logger
    expect(all.includes(Buffer.from("pino-export-check for [email]"))).toBe(true);
    expect(all.includes(Buffer.from("someone@example.com"))).toBe(false);
  }, 30000);
});

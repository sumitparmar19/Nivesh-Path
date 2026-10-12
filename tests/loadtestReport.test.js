// The load-test report (loadtest/report.js) turns k6 summaries and Prometheus cache counters into the table in
// docs/PERFORMANCE.md. The cache hit rate of the trade run is the change in the counters since the read run.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const summary = (rate, count, p50, p95, p99, failed) => ({
  metrics: { http_reqs: { rate, count }, http_req_failed: { value: failed }, http_req_duration: { "p(50)": p50, "p(95)": p95, "p(99)": p99 } },
});

test("builds one row per run with RPS, latency percentiles, error rate and per-run cache hit rate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "k6-"));
  const write = (name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value));
  write("read-on.json", summary(120.5, 15000, 3.2, 8.75, 20, 0));
  write("cache-read-on.json", { hits: 900, total: 1000 });
  write("trade-on.json", summary(9.8, 1200, 15, 30, 80, 0.001));
  write("cache-trade-on.json", { hits: 1000, total: 1200 }); // +100 hits of +200 lookups during the trade run
  write("read-off.json", summary(60, 7000, 10, 25, 60, 0));
  write("cache-read-off.json", { hits: 0, total: 800 });
  const out = execFileSync("node", [path.join(__dirname, "..", "loadtest", "report.js"), dir], { encoding: "utf8" });
  const rows = out.trim().split("\n");
  expect(rows[2]).toBe("| Read mix | on | 120.5 | 3.2 ms | 8.8 ms | 20.0 ms | 0.0% | 90.0% | 15000 |");
  expect(rows[3]).toBe("| Trade mix | on | 9.8 | 15.0 ms | 30.0 ms | 80.0 ms | 0.1% | 50.0% | 1200 |");
  expect(rows[4]).toBe("| Read mix | **off** | 60.0 | 10.0 ms | 25.0 ms | 60.0 ms | 0.0% | 0.0% | 7000 |");
  expect(rows).toHaveLength(5); // trade-off missing: no row rather than a made-up one
});

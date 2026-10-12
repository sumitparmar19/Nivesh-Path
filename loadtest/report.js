// Turns the load-test outputs into the Markdown table for docs/PERFORMANCE.md and the GitHub run summary:
//   node loadtest/report.js <results dir>
// Inputs (written by .github/workflows/loadtest.yml): k6 --summary-export files {read,trade}-{on,off}.json, and the
// cache counters read from Prometheus after each run, cache-{read,trade}-{on,off}.json = {hits, total}.
// The cache hit rate of a run is the change in those counters during that run.
const fs = require("fs");
const path = require("path");

const dir = process.argv[2] || "results";
const read = (name) => {
  const file = path.join(dir, name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
};
const ms = (v) => (typeof v === "number" ? `${v.toFixed(1)} ms` : "n/a");
const pct = (v) => (typeof v === "number" && Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : "n/a");

function row(mix, mode, prevCache) {
  const s = read(`${mix}-${mode}.json`);
  const cache = read(`cache-${mix}-${mode}.json`);
  if (!s) return null;
  const m = s.metrics;
  const d = m.http_req_duration;
  const hits = cache ? cache.hits - (prevCache ? prevCache.hits : 0) : NaN;
  const total = cache ? cache.total - (prevCache ? prevCache.total : 0) : NaN;
  return {
    cells: [
      mix === "read" ? "Read mix" : "Trade mix",
      mode === "on" ? "on" : "**off**",
      (m.http_reqs.rate || 0).toFixed(1),
      ms(d["p(50)"]), ms(d["p(95)"]), ms(d["p(99)"]),
      pct(m.http_req_failed.value),
      total > 0 ? pct(hits / total) : "n/a (no lookups)",
      String(m.http_reqs.count),
    ],
    cache,
  };
}

const lines = [
  "| Mix | Cache | Requests/s | p50 | p95 | p99 | Error rate | Cache hit rate | Requests |",
  "|---|---|---|---|---|---|---|---|---|",
];
for (const mode of ["on", "off"]) {
  const r = row("read", mode, null);
  const t = row("trade", mode, r && r.cache);
  for (const x of [r, t]) if (x) lines.push(`| ${x.cells.join(" | ")} |`);
}
process.stdout.write(`${lines.join("\n")}\n`);

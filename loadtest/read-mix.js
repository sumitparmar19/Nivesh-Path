// k6 read-heavy mix: what a visitor does most - Markets quotes, a stock page (quote, profile, key stats, news) and
// their own portfolio (summary + history). One iteration = one "page visit" pattern with 1 s of think time.
// Run: k6 run -e BASE_URL=http://localhost:3000 -e VUS=20 -e DURATION=2m loadtest/read-mix.js
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, SYMBOLS, pick, stages, SUMMARY_STATS, registerUsers, authHeaders, VUS } from "./lib.js";

export const options = {
  scenarios: { reads: { executor: "ramping-vus", startVUs: 0, stages: stages(), gracefulRampDown: "5s" } },
  summaryTrendStats: SUMMARY_STATS,
  // Recorded, not enforced: the numbers are what they are (docs/PERFORMANCE.md).
  thresholds: { http_req_failed: ["rate<1"], http_req_duration: ["p(95)<60000"] },
};

export function setup() {
  return { tokens: registerUsers(VUS, "read") };
}

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  const symbol = pick(SYMBOLS);
  const others = SYMBOLS.slice(0, 6).join(",");

  const markets = http.get(`${BASE}/api/stocks/quotes?symbols=${others}`, { tags: { name: "markets: quotes" } });
  const page = http.batch([
    ["GET", `${BASE}/api/stocks/${symbol}/quote`, null, { tags: { name: "stock page: quote" } }],
    ["GET", `${BASE}/api/stocks/${symbol}/profile`, null, { tags: { name: "stock page: profile" } }],
    ["GET", `${BASE}/api/stocks/${symbol}/metrics`, null, { tags: { name: "stock page: metrics" } }],
    ["GET", `${BASE}/api/stocks/${symbol}/news`, null, { tags: { name: "stock page: news" } }],
  ]);
  const portfolio = http.get(`${BASE}/api/portfolio/cash-balance`, { ...authHeaders(token), tags: { name: "portfolio: summary" } });
  const history = http.get(`${BASE}/api/transactions`, { ...authHeaders(token), tags: { name: "portfolio: history" } });

  check(markets, { "markets 200": (r) => r.status === 200 });
  check(page[0], { "quote 200": (r) => r.status === 200 });
  check(portfolio, { "portfolio 200": (r) => r.status === 200 });
  check(history, { "history 200": (r) => r.status === 200 });
  sleep(1);
}

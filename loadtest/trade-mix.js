// k6 trade mix: each virtual user is its own account and places market orders - mostly 1-share buys, a sell when it
// owns shares - then checks its portfolio. Every order carries an Idempotency-Key and goes through the real ledger
// (row lock, Behavioral Mirror check capped at 1.5 s, AI memory ingest in the background). 1 s think time.
// Run: k6 run -e BASE_URL=http://localhost:3000 -e VUS=10 -e DURATION=2m loadtest/trade-mix.js
import http from "k6/http";
import { check, sleep } from "k6";
import { BASE, SYMBOLS, pick, stages, SUMMARY_STATS, registerUsers, authHeaders, VUS } from "./lib.js";

export const options = {
  scenarios: { trades: { executor: "ramping-vus", startVUs: 0, stages: stages(), gracefulRampDown: "5s" } },
  summaryTrendStats: SUMMARY_STATS,
  thresholds: { http_req_failed: ["rate<1"], http_req_duration: ["p(95)<60000"] },
};

export function setup() {
  return { tokens: registerUsers(VUS, "trade") };
}

let owned = {};
let n = 0;

export default function (data) {
  const token = data.tokens[(__VU - 1) % data.tokens.length];
  n += 1;
  const held = Object.keys(owned).filter((s) => owned[s] > 0);
  const selling = held.length > 0 && n % 4 === 0;
  const symbol = selling ? pick(held) : pick(SYMBOLS);
  const key = `k6-${__VU}-${__ITER}-${Date.now()}`;
  const res = http.post(
    `${BASE}/api/trades`,
    JSON.stringify({ symbol, quantity: 1, type: selling ? "SELL" : "BUY" }),
    { ...authHeaders(token, { "Idempotency-Key": key }), tags: { name: selling ? "trade: sell" : "trade: buy" } }
  );
  const ok = check(res, { "order filled (201)": (r) => r.status === 201 });
  if (ok) owned[symbol] = (owned[symbol] || 0) + (selling ? -1 : 1);

  const summary = http.get(`${BASE}/api/portfolio/cash-balance`, { ...authHeaders(token), tags: { name: "portfolio: summary" } });
  check(summary, { "portfolio 200": (r) => r.status === 200 });
  sleep(1);
}

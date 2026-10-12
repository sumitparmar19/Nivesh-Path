// Shared helpers for the k6 load tests (loadtest/*.js): base URL, the tickers used, test-user registration and the
// summary options. Users are created by the test itself (unique emails on the .invalid domain), so it never touches
// real accounts. Claude is never called: the Advisor/coach endpoints are excluded on purpose.
import http from "k6/http";
import { check } from "k6";

export const BASE = __ENV.BASE_URL || "http://localhost:3000";
export const VUS = Number(__ENV.VUS || 20);
export const DURATION = __ENV.DURATION || "2m";
export const SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "NFLX", "JPM", "WMT", "XOM", "KO"];

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Ramp up, hold, ramp down: the "hold" part is what the numbers describe. */
export function stages() {
  return [
    { duration: "20s", target: VUS },
    { duration: DURATION, target: VUS },
    { duration: "10s", target: 0 },
  ];
}

export const SUMMARY_STATS = ["avg", "min", "med", "p(50)", "p(90)", "p(95)", "p(99)", "max"];

/** Register `count` fresh users and return their JWTs (called once, from setup()). */
export function registerUsers(count, tag) {
  const run = `${Date.now()}`.slice(-8);
  const tokens = [];
  for (let i = 0; i < count; i += 1) {
    const res = http.post(
      `${BASE}/api/register`,
      JSON.stringify({ name: `k6 ${tag} ${i}`, email: `k6-${tag}-${run}-${i}@loadtest.invalid`, mobile: `${run}${String(i).padStart(2, "0")}`, password: "loadtest-only-123" }),
      { headers: { "Content-Type": "application/json" }, tags: { name: "register (setup)" } }
    );
    check(res, { "registered": (r) => r.status === 201 });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${res.body}`);
    tokens.push(res.json("token"));
  }
  return tokens;
}

export const authHeaders = (token, extra = {}) => ({ headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...extra } });

# Measured results

Every number here was measured, and each row says where it came from. Numbers copied from a run's output are
reproduced exactly. GitHub keeps workflow logs for 90 days, so the results that matter are written down here and
in the linked pages.

## 1. AWS demo stack: autoscaling under load (Oct 14, 2026)
Full output: [`aws/LOADTEST_RESULTS.md`](aws/LOADTEST_RESULTS.md).

| Measure | Result |
|---|---|
| Load | k6 read mix, 50 virtual users, 8 min hold after a 20 s ramp-up, 1 s think time, through the Application Load Balancer |
| Requests | **95,964**, at **180.3 requests/s** |
| Latency | p50 103.9 ms · p95 405.4 ms · p99 901.3 ms |
| Failed requests | 0.57% (554 of 95,964; 523 of the failed checks were stock quotes) |
| Autoscaling | web tasks **1 → 2 → 3** (desired 2 at 06:57:25, running 06:58:48; desired 3 at 07:00:32, running 07:01:35 UTC) |

Source: the `AWS demo: load test` workflow, run #1, commit `f37b1f1`, k6 v1.4.0.

## 2. Cache on vs off (k6 in CI)
Full setup and limits: [`PERFORMANCE.md`](PERFORMANCE.md). One 4-vCPU / 15 GB GitHub runner shared by k6 and the
whole stack, made-up market data, PostgreSQL ledger.

| Mix | Cache | Requests/s | p50 | p95 | p99 | Error rate | Cache hit rate | Requests |
|---|---|---|---|---|---|---|---|---|
| Read mix | on | 121.9 | 3.2 ms | 9.6 ms | 15.2 ms | 0.0% | 99.7% | 18,605 |
| Trade mix | on | 17.4 | 14.3 ms | 21.8 ms | 35.3 ms | 0.0% | 99.9% | 2,640 |
| Read mix | **off** | 120.2 | 5.5 ms | 22.3 ms | 37.7 ms | 0.0% | 0.0% | 18,276 |
| Trade mix | **off** | 17.4 | 13.8 ms | 21.5 ms | 33.9 ms | 0.0% | 0.0% | 2,642 |

- Read p95 is **2.3× slower** without the cache (9.6 → 22.3 ms).
- **0 errors** in about 42,000 requests across both runs.
- About **11 cache lookups per trade**, which is why the cache is required on Finnhub's 60-calls-a-minute free plan.

Source: the `Load test` workflow, run #4, commit `72d447b` (an earlier run, #1 on commit `189ef2d`, was within
about 10–15%).

## 3. The live site: end-to-end smoke test (Oct 14, 2026)
`frontend/e2e/live-smoke.spec.ts`, run by the `Live smoke test` workflow against
https://nivesh-path-vzeak.ondigitalocean.app with a brand-new user that the test deletes at the end.

| Measure | Result |
|---|---|
| Run #3 | **All 10 steps passed in 38.8 s** |
| Covered | public pages, legacy redirects, `/api/status` (ledger `postgres`), `/internal/*` returns 404, security headers, no keys in the page; register, wrong password, log in; markets and stock pages with real Finnhub data; buy and sell on the PostgreSQL ledger; portfolio, transactions, Behavioral Mirror, watchlist; account (profile, theme, password); one real contact-form email; account deletion |
| Double-click Buy | exactly **one** trade; the same `Idempotency-Key` is replayed |
| One real Advisor analysis (LLM, Anthropic Claude API) | 15–17 s per call (runs #1 and #2, the only runs that made the call) |

Runs #1 and #2 found a real bug: profile edits typed before the profile had loaded were lost (it loads instantly
locally, so only the live runs saw it). The fields now stay locked until the profile arrives, with a test; run #3
passed.

## 4. Ledger correctness
Details: [`LEDGER.md`](LEDGER.md). These run in CI on every push, against a real PostgreSQL.

| Test | Result |
|---|---|
| 20 parallel $10,000 buys on a $100,000 account, across two app instances | exactly 10 filled, cash **$0.00** |
| 10 parallel 1-share sells with 5 shares owned | exactly 5 filled |
| The same order sent 5 times at once | **1** trade |
| 10 × $10.01 buys | cash exactly 99,899.90 (NUMERIC, not floating point) |

**Live move from MongoDB to PostgreSQL (Oct 12, 2026):** dry run 0 rounding changes and 0 blocking problems;
verify "All users match (1)", cash and every holding to the cent; afterwards `db-check` reported PostgreSQL 18.6,
1 account, 8 trades.

## 5. Observability
Details: [`OBSERVABILITY.md`](OBSERVABILITY.md).

| Measure | Result | Where |
|---|---|---|
| One trade = one trace across both services | **94 spans** across `nivesh-web` and `nivesh-ai` | local Jaeger 1.62, PostgreSQL ledger |
| Joined trace on the live site | `GET /api/ai/memory`, **2 services**, 26 spans, 86.64 ms (trace `4522bb43793083b426c4d835d5303515`, Oct 12) | Grafana Tempo |
| Live alert test | the p95 rule fired and the email "Nivesh-Path › Web: p95 latency above 1.5 s" arrived | Grafana Cloud |
| Live dashboard right after import | 0.1 req/s, 0% 5xx, p95 4.93 ms, AI service up | Grafana Cloud |
| No leaks | the test user's email, password, JWT, internal token and order key appear in no exported span or log | local search of every export |
| Memory cost of telemetry (web) | off 104 / 104 MB, on 111 / 112 MB: **about +8 MB** | two local runs each, 400 requests + 1 export |
| AI-down signal | `nivesh_ai_service_up` 1 → 0 within **40 s** | local |
| Graceful shutdown | SIGTERM to exit in **1.8 s** (was a 10 s timeout) | local |

## 6. Nightly job on AWS (Oct 14, 2026)
EventBridge Scheduler → Step Functions → Lambda → the live web service's token-only `/internal/jobs/*`
([`AWS.md`](AWS.md) §8).

| Run | Result |
|---|---|
| First manual run | all 7 snapshots failed (`SomeSnapshotsFailed`): the live Finnhub key was invalid (HTTP 401), which had also broken live prices. **The failure email arrived, as designed** |
| After replacing the key: Step Functions execution `43e37234-e198-4c0b-9d90-5e5309edfd47`, `SUCCEEDED` | held tickers DIA, INTC, META, MSFT, QQQ, SPY, WMT: **7 closes saved**, 0 skipped, 0 failed; concentration check for 1 user, 0 new events, 0 failed |

Estimated cost: about $0 a month (inside the Step Functions and Lambda free tiers, `AWS.md` §8.2).

## 7. Page stability (Lighthouse 12, local production build)
Local server with no network delay, so these are not live numbers. Before and after fixing the layout shift while a
page loads (a loading placeholder with full height, sized logos, the signed-in redirect before drawing):

| Page | CLS before | CLS after | Performance after |
|---|---|---|---|
| Mobile `/markets` | 0.62 | 0.005 | 100 |
| Mobile `/stock/AAPL` | 0.76 | 0.087 | 94 |
| Mobile `/portfolio` | 0.62 | 0 | 97 |
| Mobile `/` (logged out) | 0.75 | 0.001 | 68–87 (waits for Google Fonts) |
| Desktop `/markets` | 0.22 | 0.086 | 98 |
| Desktop `/stock/AAPL` | 0.28 | 0.051 | 99 |
| Desktop `/portfolio` | 0.26 | 0.109 | 97 |
| Desktop `/` (logged out) | 0.29 | 0.103 | 92 |

## 8. Planted bugs (each check proven to catch what it guards)

| Planted bug | Caught by |
|---|---|
| `FOR UPDATE` removed | `tests/ledger.pg.test.js`: 10 of 10 sells filled with only 5 shares owned |
| Idempotent replay turned off | Jest idempotency test: `expected 200, received 201` (charged twice) |
| Migration conflict check removed | `tests/ledgerMigration.pg.test.js`: newer Postgres cash overwritten |
| Span scrubbing turned off (web / AI service) | `tests/telemetry.test.js` / `ai-service/tests/test_telemetry.py` real-span redaction tests |
| A Behavioral Mirror severity boundary changed, or the dedup check removed | `tests/behavior.test.js` |
| The permissions boundary removed from an IAM role | the custom Checkov rule `CKV2_NIVESH_1` ("FAILED for resource: aws_iam_role.execution") |

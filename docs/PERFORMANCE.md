# Performance: k6 load tests

**Source of every number below:** the GitHub Actions run [Load test #4](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38203584203) on commit `62245a1`. The numbers are copied from that run's job log ("Summary" step), and its `loadtest-results` artifact has the raw k6 and Prometheus files. Commits after `62245a1` on this PR change only docs.

## Results

| Mix | Cache | Requests/s | p50 | p95 | p99 | Error rate | Cache hit rate | Requests |
|---|---|---|---|---|---|---|---|---|
| Read mix | on | 121.9 | 3.2 ms | 9.6 ms | 15.2 ms | 0.0% | 99.7% | 18,605 |
| Trade mix | on | 17.4 | 14.3 ms | 21.8 ms | 35.3 ms | 0.0% | 99.9% | 2,640 |
| Read mix | **off** | 120.2 | 5.5 ms | 22.3 ms | 37.7 ms | 0.0% | 0.0% | 18,276 |
| Trade mix | **off** | 17.4 | 13.8 ms | 21.5 ms | 33.9 ms | 0.0% | 0.0% | 2,642 |

The cache counters behind the hit rates (from Prometheus, cumulative since each backend start):
- cache on: 26,478 hits of 26,562 lookups after the read mix, then 55,927 of 56,047 after the trade mix;
- cache off: 0 of 28,688, then 0 of 57,774.

**Repeatability:** an earlier run on this PR ([Load test #1](https://github.com/sumitparmar19/Nivesh-Path/actions/runs/38202627048), commit `7d407e2`) gave read-mix p95 10.2 ms with the cache on and 25.3 ms with it off, and trade-mix p95 24.1 / 26.9 ms. That's within about 10–15% of the run above.

## What the numbers say
- **Reads:** with the cache **off**, the read mix's p95 is **2.3× slower** (9.6 → 22.3 ms) and its p99 is 2.5× slower (15.2 → 37.7 ms). The median moves less (3.2 → 5.5 ms). The cache answers 99.7% of lookups.
- **Trades:** they barely change with the cache (p95 21.8 vs 21.5 ms). An order's time is spent in the Postgres transaction (row lock, insert, update) and the Behavioral Mirror check, not in price lookups.
- **Errors:** none in about 42,000 requests across both runs: every check passed, including every order (`201`) and every portfolio read.
- **Lookups per trade:** each trade makes about **11 cache lookups**. The trade-mix run alone did about 29,500 lookups for 2,640 requests: the live price, the Mirror's 5-day move and today's move, and prices for every holding in the concentration check and the portfolio summary.
  - With real market data and the cache off, that would be about 11 Finnhub calls per trade. Finnhub's free plan allows 60 a minute, so the cache isn't optional in production.

## Exact setup
- **Workflow:** `.github/workflows/loadtest.yml`. It runs on demand (Actions → "Load test" → Run workflow) and on every PR that changes the load test.
- **Machine:** one GitHub-hosted `ubuntu-latest` runner, **4 vCPU, 15 GB RAM**. k6 and the whole stack run on it together: web (Node 22, Docker image), AI service, Postgres 16, MongoDB 7, Redis 7 and Prometheus.
- **Data:**
  - `FAKE_MARKET_DATA=1`: made-up prices generated in the web service, with no Finnhub calls.
  - The **Postgres ledger** (`LEDGER_BACKEND=postgres`).
  - Fresh databases for each cache mode.
  - Test users are created by the test (`@loadtest.invalid`).
- **Load:** closed model (`ramping-vus`): 20 s ramp-up, **2 min hold**, 10 s ramp-down, **1 s think time** per iteration.
  - **Read mix** (`loadtest/read-mix.js`), **20 virtual users**. Each iteration makes 7 requests:
    - Markets quotes for 6 stocks;
    - the stock page's quote, profile, key stats and news (in parallel);
    - portfolio summary and trade history (authenticated).
  - **Trade mix** (`loadtest/trade-mix.js`), **10 virtual users**, each its own account. Each iteration:
    - places one 1-share order with an `Idempotency-Key` (a sell every 4th iteration once shares are held, otherwise a buy);
    - then reads the portfolio summary.
  - **Never called:** Claude (the Advisor and AI coach) is excluded, because it costs money and would measure Anthropic, not this app.
- **Cache off** means `CACHE_DISABLED=1`: every lookup misses (`src/lib/cache.js`).
- **Cache hit rate:** the app's own `nivesh_cache_requests_total` counter, sent over OTLP to a Prometheus in `docker-compose.loadtest.yml`. It's read after each mix, and each row uses the change during that mix.

## Limits, said plainly
- **Requests/s is not the server's maximum.** The test is closed-loop with 1 s think time, so requests/s ≈ users × requests per iteration ÷ (1 s + response time). That's why cache on and off show the same requests/s. **Latency is the meaningful result here.** A capacity (max-throughput) test would need an open-model arrival-rate scenario on dedicated hardware.
- **The cache-off penalty here is a lower bound.** Fake market data is generated in-process in microseconds. A real Finnhub call costs tens to hundreds of milliseconds over the network, so the real gap between cache on and off is much larger than 9.6 vs 22.3 ms.
- **This is one shared CI machine.** k6, the app and four databases compete for the same 4 vCPUs. Absolute numbers will differ on DigitalOcean (0.5 GB web instance, Neon over the network) and AWS (PR E's run).
- **Telemetry was on during the test** (metrics only, exported every 5 s to Prometheus), as it will be in production. Traces and logs weren't exported.
- **Two runs aren't a distribution.** The figures vary by roughly 10–15% between runs.

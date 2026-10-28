# AWS demo stack: load test and autoscaling result

Everything on this page is copied from what the run printed: the k6 end-of-test summary, the "Summary" step
and the web-task samples. Nothing is recomputed or rounded differently. The raw job log is archived privately.
The stack was destroyed after the test (`AWS demo: destroy`, same day), so the load balancer address below no
longer exists.

## The run
| | |
|---|---|
| Workflow | `AWS demo: load test` (`.github/workflows/aws-demo-loadtest.yml`), run #1, triggered by hand (`workflow_dispatch`) |
| Date | **Oct 14, 2026**: job ran 06:51:09 → 07:02:31 UTC |
| Commit | `f37b1f1` |
| Result | success; k6 exit code 0 |
| Tool | k6 v1.4.0 (checksum-pinned), `loadtest/read-mix.js` |
| Target | `http://nivesh-demo-213656686.us-east-1.elb.amazonaws.com` (the demo stack's Application Load Balancer) |
| Load | 50 virtual users · 8m hold after a 20 s ramp-up · 1 s think time · tickers AAPL,MSFT,NVDA,TSLA |
| Stack | ECS Fargate cluster `nivesh-demo`, us-east-1. web tasks 0.25 vCPU / 0.5 GB, autoscaling 1–3 on 60% CPU (`docs/AWS.md`) |
| Artifact | `aws-loadtest` (5,307 bytes; `read-aws.json`, `read-aws.txt`, `scaling.txt`), kept by GitHub for 90 days. Its contents are the same output as below |

## Summary (as printed by the "Summary" step)

| Requests/s | p50 | p95 | p99 | Error rate | Requests |
|---|---|---|---|---|---|
| 180.3 | 103.9 ms | 405.4 ms | 901.3 ms | 0.6% | 95964 |

## Web tasks (UTC time, desired, running), sampled every 20 s

```
06:51:31 1	1
06:51:52 1	1
06:52:13 1	1
06:52:34 1	1
06:52:54 1	1
06:53:15 1	1
06:53:36 1	1
06:53:57 1	1
06:54:18 1	1
06:54:38 1	1
06:54:59 1	1
06:55:20 1	1
06:55:41 1	1
06:56:02 1	1
06:56:23 1	1
06:56:43 1	1
06:57:04 1	1
06:57:25 2	1
06:57:46 2	1
06:58:07 2	1
06:58:27 2	1
06:58:48 2	2
06:59:09 2	2
06:59:30 2	2
06:59:51 2	2
07:00:11 2	2
07:00:32 3	2
07:00:53 3	2
07:01:14 3	2
07:01:35 3	3
07:01:56 3	3
07:02:16 3	3
```
Most web tasks running: 3

The autoscaler asked for a 2nd task at 06:57:25 (running at 06:58:48) and a 3rd at 07:00:32 (running at 07:01:35),
the maximum the stack allows.

## k6 end-of-test summary (as printed)

```
  █ THRESHOLDS

    http_req_duration
    ✓ 'p(95)<60000' p(95)=405.38ms

    http_req_failed
    ✓ 'rate<1' rate=0.57%


  █ TOTAL RESULTS

    checks_total.......: 54858  103.077335/s
    checks_succeeded...: 99.04% 54333 out of 54858
    checks_failed......: 0.95%  525 out of 54858

    ✓ registered
    ✗ markets 200
      ↳  99% — ✓ 13700 / ✗ 2
    ✗ quote 200
      ↳  96% — ✓ 13179 / ✗ 523
    ✓ portfolio 200
    ✓ history 200

    HTTP
    http_req_duration..............: avg=162.56ms min=1.75ms med=103.86ms p(50)=103.86ms p(90)=307.95ms p(95)=405.38ms p(99)=901.31ms max=9.66s
      { expected_response:true }...: avg=160.44ms min=1.75ms med=103.68ms p(50)=103.68ms p(90)=306.3ms  p(95)=403.14ms p(99)=892.62ms max=9.66s
    http_req_failed................: 0.57%  554 out of 95964
    http_reqs......................: 95964  180.314874/s

    EXECUTION
    iteration_duration.............: avg=1.8s     min=1.01s  med=1.79s    p(50)=1.79s    p(90)=2.2s     p(95)=2.59s    p(99)=4.88s    max=11.06s
    iterations.....................: 13702  25.745846/s
    vus............................: 1      min=0            max=50
    vus_max........................: 50     min=50           max=50

    NETWORK
    data_received..................: 108 MB 202 kB/s
    data_sent......................: 20 MB  38 kB/s



k6 exit code: 0
```

## Reading it
- **Scaling:** web went from 1 to 3 tasks under a steady 50-user load. The 1 → 2 step took about 6 minutes from the
  start of the load (CPU must stay above target for several minutes before ECS adds a task). Each new task took
  between about 1 and 1.5 minutes from "desired" to "running" (06:57:25 → 06:58:48, then 07:00:32 → 07:01:35).
- **Throughput:** 95,964 requests at 180.3 requests/s over the run. As with the CI load test, this is a closed loop
  with 1 s think time, so requests/s follows the user count. It is not the stack's maximum.
- **Latency:** p50 103.9 ms, p95 405.4 ms, p99 901.3 ms through the load balancer to 0.25 vCPU tasks. These are not
  comparable 1:1 with the CI numbers in [`PERFORMANCE.md`](../PERFORMANCE.md) (one 4-vCPU machine, no network hop,
  made-up prices).
- **Failures:** 554 of 95,964 requests (0.57%) failed. By check, 523 of the failures were stock quotes and 2 were
  the markets list; portfolio and history reads had none. The log doesn't say why. Quotes are the only requests that
  depend on the Finnhub free plan (60 calls a minute), and each task has its own in-memory cache on the demo stack,
  so rate limiting is the likely cause, but it was not confirmed.
- **Thresholds:** the run's thresholds (`p(95)<60000`, `rate<1`) are deliberately loose. They only fail the job if
  the stack is broken. The numbers above are the result, not a pass/fail.

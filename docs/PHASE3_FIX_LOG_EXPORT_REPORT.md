# Phase 3 fix: OpenTelemetry log export crashed every batch (live issue 3.1)

**Status:** fixed and tested. Small PR, highest priority (live log spam), from the planning chat's live-status report.

## 1. Your steps (after merge)
1. Merge (say "merge"). DigitalOcean redeploys web and ai by itself.
2. **If you set `OTEL_LOGS_EXPORTER=none` on web:** DigitalOcean → app → Settings → web → Environment Variables → **delete** it → Save. Leaving it set is also safe; logs just won't be exported.
3. **Check in the web Runtime Logs (a few minutes after the deploy):** the `TypeError: Cannot read properties of undefined (reading 'export')` lines are gone.
4. **Check in Grafana:** Explore → choose the data source ending in `-logs` (Loki) → `{service_name="nivesh-web"}` → Run query. JSON request lines appear, each with a `trace_id`.

## 2. What changed
- **The cause:** `src/telemetry.js` passed the OTLP log exporter positionally: `new BatchLogRecordProcessor(new OTLPLogExporter())`. `@opentelemetry/sdk-logs` 0.223 expects `new BatchLogRecordProcessor({ exporter })`, so the exporter was `undefined` and every batch threw. There's one copy of each package (`npm ls` shows 0.223.0, deduped), so it's not a duplicate-package problem.
- **The fix:** the one-line constructor change in `src/telemetry.js`.
- **AI service:** its Python processor takes the exporter positionally, which is correct for its version. I moved the pipeline into `telemetry.log_provider()`, so the test sends a batch through exactly what `setup()` installs.
- **Docs:** `docs/OBSERVABILITY.md` §5b.

**Tests (before → after):**

| Suite | Before | After | New |
|---|---|---|---|
| Jest | 185 | 186 | `tests/telemetryLogExport.test.js`: a **real** log batch, from a child `node` process, to a local OTLP receiver. It checks a direct log record and an app (pino) log line; the email is scrubbed; no export errors; the flush completes |
| pytest | 52 | 53 | `test_a_real_log_batch_reaches_the_otlp_endpoint` (real HTTP receiver) |
| Vitest | 111 | 111 | |

## 3. Bugs planted on purpose
- **Put the old constructor back** (`new BatchLogRecordProcessor(new OTLPLogExporter())`): the new Jest test failed with `"Cannot read properties of undefined (reading 'export')"` and `"... (reading 'forceFlush')"`, the same error as the live logs.
- **Removed the Python log processor:** the new pytest failed with "no request to /v1/logs".

## 4. Real numbers
None. This is a correctness fix.

## 5. Limits
- **The test checks that the batch reaches an OTLP receiver** with the right content. It doesn't log in to Grafana; your step 4 is that check.
- **The Python SDK warns** that its `LoggingHandler` is deprecated in favour of `opentelemetry-instrumentation-logging`. It still works; switching is a later clean-up.

## 6. Resume bullet
- Found and fixed a production telemetry bug, where log export failed on every batch after an SDK constructor change. Added an end-to-end test that pushes a real batch to a local OTLP receiver, and it fails on the old code with the exact production error.

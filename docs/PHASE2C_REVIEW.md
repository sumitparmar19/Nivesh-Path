# Phase 2C (Behavioral Mirror): review of the instructions against the real code

**What I checked:** the Phase 2C instruction file, line by line, against `main` as it is now (Phase 2B merged, commit `4bb3f53`).
**Pre-flight (Step 0):** Phase 2B is in `main`. Test counts match the file: 79 Jest + 23 pytest + 75 Vitest + 1 Playwright = **178**.
**Verdict:** the idea and the three detectors are right. About half of the code snippets, though, are written for a different codebase (paths, helpers, field names), and **4 issues would break the feature or give wrong results**. Below is everything I'll change, and why.

---

## 1. Blocking issues (must change)

| # | Problem in the instructions | What would happen | Fix |
|---|---|---|---|
| 1 | The new Mongoose model writes to the `behavioral_patterns` collection, but the AI service already owns it (`PatternStore`). On boot it creates a **unique index on `(user_id, pattern_type)`** | Node's documents use `userId`/`patternType`, so Mongo sees both index fields as missing (null). The **second pattern ever saved fails with a duplicate-key error**, which is silently swallowed: detection stops working with no visible error | Node saves one document per detection to a **new collection, `behavioral_events`**. `behavioral_patterns` (PatternStore) keeps its planned role: one summary per user per pattern type (counts, latest AI insight). This also follows the CLAUDE.md rule "durable AI data goes to MongoDB via PatternStore" |
| 2 | The panic-sell detector needs 7-day **candles** | Candles are not on the free Finnhub plan. `check-finnhub.js` was never run, and the code already treats candles as optional. **Panic sell would never fire** on the live site | Use Finnhub's **metrics** endpoint, which the free plan includes and we already call: `5DayPriceReturnDaily` (5-day move), `52WeekHigh`, plus today's change from the quote. Panic sell = selling after a 5-day drop of at least 5% (same severity bands). FOMO's "5-day run-up" uses the same field. No candles needed |
| 3 | Every detector `return`s early when `FAKE_MARKET_DATA=1` | CI and the browser test could **never** see a pattern, so the feature would be untested end to end | Detectors read market data through the existing `marketData` service. In fake mode that service already returns stable made-up numbers. I'll make the fake data include one stock that triggers FOMO, so the Playwright test can check the full path: trade → pattern → Behavioral Mirror page |
| 4 | Overconcentration is measured against **holdings only** | A new user's **first buy is always 100% of their holdings**, so everyone gets a "high" overconcentration warning on day one. Each later buy of the same stock adds another duplicate warning | Measure each stock's share of **total account value (cash + holdings)**: putting $90k of $100k into one stock is risky, buying one share is not. Don't record a new event for the same stock unless its severity goes up (no duplicates). *This is the one judgement call; see section 4* |

## 2. Doesn't match the codebase (adapt, same intent)

| Instructions say | Real code | I'll use |
|---|---|---|
| `backend/src/...` | No `backend/` folder; the server is at the repo root | `src/models/BehaviorEvent.js`, `src/lib/patternDetector.js`, `src/routes/patterns.js` |
| `routes/trades.js` with separate buy/sell handlers | One handler in `src/routes/purchases.js`; the ledger returns the saved trade | Call the detector once there, next to the existing fire-and-forget AI memory call |
| `axios` + `process.env.FINNHUB_API_KEY` | No axios. Market data goes through `src/lib/marketData.js` (cached, rate-limit safe, fake mode built in) | Inject `marketData` into the detector (also makes tests easy, with no HTTP mocking) |
| `req.userId`, `require('../middleware/auth')` | `req.user.id`, `{ requireAuth }` | The real ones |
| Trade fields `trade.symbol`, `trade.shares`, `type: 'buy'` | `name` (ticker), `quantity`, `transactionType` | The real fields |
| `AI_URL` default port **8000**, direct axios call | AI service is on **8001**; all calls go through `src/lib/aiClient.js` | Add `aiClient.analyzeBehavior()` |
| `ai-service/routers/behavioral.py`, `from ..main import llm` | No `routers/` folder; the LLM lives in `services/llm_service.py` (Anthropic SDK + LangChain prompt, structured output) | New endpoint `POST /api/ai/behavior/{user_id}` in `main.py`, plus a method on `LLMService` |
| Fallback model `claude-3-haiku-20240307` via `langchain_anthropic` | `langchain_anthropic` isn't installed; the model comes from `CLAUDE_MODEL` | The configured model. **Rule-based insight when there is no API key or the call fails** (same as the advisor), so the page never shows nothing |
| `frontend/src/router/index.tsx`, `NAV_ITEMS`, emoji icons | Routes in `App.tsx`; nav is `SIDEBAR` in `Layout.tsx` with lucide icons | Add to both; lucide `Brain` icon; unread dot on the nav item |
| `get/post/patch/del` helpers in `api.ts` | One `request()` helper | `api.patterns.*` built on `request()` |
| Page uses `useEffect` + `useState`; card calls the API itself | Every 2B page uses TanStack Query + toasts | Same pattern: queries, mutations, cache refresh, toasts |
| Hard-coded colours (`bg-blue-50`, `text-red-500`, `#ef4444`...) | Design tokens (brand, up/down, surface, line), light + dark | Tokens, so dark mode and the theme switch keep working |
| Branch `feat/behavioral-mirror` | This session pushes only to `claude/project-overview-resources-vgzpog` | That branch; PR to `main` as usual |
| Tests in `backend/tests/*.test.js` | Jest runs `tests/` at the repo root | `tests/patternDetector.test.js`, `tests/patterns.test.js` |

## 3. Logic problems in the instructions (fixed in my version)

1. **Scores don't add up.**
   - Impulsive is `(panic + fomo) / all patterns`, so **one FOMO buy = 100% impulsive, 0 patient**, whether you made 1 trade or 200.
   - "Patient" is just `100 − impulsive`, so it adds no information.
   - The test list says a fresh user gets "all zero scores", but the formula gives 100.

   **Fix:** base scores on the **share of your trades** that were flagged.
   - Impulse control = trades without a panic or FOMO flag ÷ all trades.
   - Diversification = from the current largest position.
   - Show "Not enough trades yet" until there are at least 3 trades, instead of a misleading number.

   Scores are computed once, in Node, and passed to the AI. The AI does no arithmetic, per CLAUDE.md.
2. **Detectors are tied to "after the trade".** Phase 2D (pre-trade check) needs the same rules *before* a trade. I'll write each detector as a pure function: `evaluate(trade, marketFacts, portfolio)` returns a pattern or nothing. 2D can then reuse them unchanged.
3. **Account delete and portfolio reset** don't remove patterns in the instructions. Delete must remove them (privacy). Reset should too, because the trades they point to are gone.
4. **The AI insight doesn't use the user's own evidence.** The prompt only gets counts and ticker names. The project's whole idea is "coaches you with evidence from **your** history", so the prompt gets the computed facts. For example: "sold TSLA at $180 after a 12% 5-day drop; bought NVDA 1.5% under its 52-week high." The insight is also saved, so the page shows the last one without calling Claude again.
5. **Returning `err.message` to the browser on 500** (all routes in the instructions) can leak internals. Use the app's existing error handler.
6. **`?limit=` is not capped.** `limit=10000000` would load everything. Cap it at 100.

## 4. One decision for you

**Overconcentration: what counts as "the portfolio"?**
- **A (my recommendation): cash + holdings.** It warns only when one stock is a big part of the whole $100k account. No false alarm on the first buy.
- **B: holdings only, but ignore it until the user holds at least 3 stocks.** Closer to how professionals measure it, but a user who is 95% cash with 2 stocks never gets warned.

Unless you say otherwise, I'll build **A**.

## 5. What I'll add that the instructions miss

- **Visible right after a trade** (CLAUDE.md: "every feature must be visible"): if a trade is flagged, the trade panel shows a short note ("Looks like a FOMO buy: 1.5% under its 52-week high. See Behavioral Mirror"). Detection still never delays or fails the trade.
- **Portfolio page:** a small "Trading DNA" card linking to the new page.
- **What's new** entry, and docs (CLAUDE.md, PHASE2_PLAN notes, README).
- **Playwright:** the smoke test also buys the fake "FOMO" stock and checks the pattern card appears.

## 6. What can't be done (be honest in the UI)

- **No backfill for old trades.** Panic/FOMO depend on the price situation *at the moment of the trade*, and we didn't store that for past trades. The page will say "Patterns are detected for trades made from <date> on." Overconcentration can be computed for the current portfolio right away.
- **Detection depends on Finnhub.** If it's down or rate-limited, that trade is skipped (logged, never fails the trade), as the instructions intend.

## 7. Plan and test targets

| Step | Work |
|---|---|
| 1 | `BehaviorEvent` model (`behavioral_events`), detector module (3 pure rules + `runAll`), wire into the trade route, delete/reset cleanup |
| 2 | `/api/patterns` routes: list (filters, capped), summary + scores, acknowledge, delete, analyze; `aiClient.analyzeBehavior` |
| 3 | AI service: `POST /api/ai/behavior/{user_id}` (structured output, rule-based fallback, saves the summary to PatternStore) |
| 4 | React: types, `api.patterns`, `PatternCard`, `BehavioralMirror` page, route, nav + unread dot, trade-panel note, portfolio card, What's new |
| 5 | Tests, browser check (desktop/mobile, light/dark), docs, PR, CI green |

**Tests:** about **+40**, against the instructions' +32:
- Jest: about 18 (every severity boundary of the 3 rules, no-duplicate rule, routes, user isolation, fail-safe trade);
- pytest: 6;
- Vitest: 14;
- Playwright: extended.

**Target: about 218 total.** Nothing new to configure on DigitalOcean: it uses the existing Finnhub and Anthropic keys.

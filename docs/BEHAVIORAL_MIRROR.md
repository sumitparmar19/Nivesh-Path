# Behavioral Mirror

Most retail investors don't lose money for lack of information. They lose it to habits: selling in a panic after
a drop, buying after a stock has already run up, putting most of the account into one name. The Behavioral Mirror
checks every trade a user makes for those three habits, using the market data at that moment. It shows the result
right away in the trade panel, and on a dedicated page with scores, every detected pattern, and an AI coach that
explains the user's habits with their own trades.

| Part | Where |
|---|---|
| Rules (pure functions, no I/O) | `src/lib/behaviorRules.js` |
| Detector (runs the rules after a trade, saves events) | `src/lib/behaviorDetector.js` |
| Start-up clean-up when a rule changes | `src/lib/behaviorMigration.js` |
| API | `src/routes/patterns.js` (`/api/patterns*`) |
| Events | MongoDB `behavioral_events` (`src/models/BehaviorEvent.js`) |
| AI coach | `ai-service`: `POST /api/ai/behavior/{user_id}`, saved in `behavioral_patterns` (`PatternStore`) |
| Page | `frontend/src/pages/BehavioralMirror.tsx` (`/behavioral-mirror`) |
| Tests | `tests/behavior.test.js`, `tests/nightlyJob.test.js`, `ai-service/tests/test_behavior.py`, `ai-service/tests/test_account_weights.py`, Vitest, Playwright |

## 1. The rules (rule version 3)

All three rules are pure functions: `(trade, market facts, portfolio) → pattern or nothing`. They do no database or
network calls, so every severity boundary is tested directly, and a future pre-trade check can run the same rules
before an order is placed.

### Market facts
- **5-day move:** from the site's own saved daily closes once 6 recent ones exist for the stock (§3), otherwise
  Finnhub's daily `5DayPriceReturnDaily`.
- **Today's move and intraday high:** from the live quote.
- **52-week high:** the higher of Finnhub's `52WeekHigh` and today's intraday high.
- **Drop** = the larger of the two drops (5-day or today). **Run-up** = the larger of the two rises. Taking the larger
  one, not the sum, never counts today twice when Finnhub's 5-day figure already includes it.

Daily candles aren't on Finnhub's free plan, so nothing depends on them.

### Thresholds

| Pattern | Flags when | Severity |
|---|---|---|
| **Panic sell** | A **sell below your average cost** after a drop of at least 5%. At or above cost it's taking profit, not panic | drop ≥ 5% low · ≥ 10% medium · ≥ 20% high |
| **FOMO buy** | A **buy after a run-up of at least 5%**, worse the closer to the 52-week high | within 5% of the high: low · run-up ≥ 10% and within 3%: medium · run-up ≥ 15% and within 2%: high · run-up ≥ 15% even further from the high: low |
| **Overconcentration** | One stock is more than 35% of the **whole account** (cash + holdings at current prices) | > 35% low · > 50% medium · > 65% high |

- **Cash counts in concentration,** so a first small buy is never "100% concentrated".
- **No duplicate concentration warnings.** A new one is saved only if no warning is active for that stock or the
  severity went up. When the stock falls back to 35% or below (or is sold), the warning is cleared, so a later climb
  over 35% warns again.
- **Each event stores the numbers that triggered it** (`facts`): price, drop or run-up, distance from the high, the
  loss against average cost, share count, and where the 5-day move came from (`fiveDaySource`: `snapshots` or
  `finnhub`). The card text is built from these, and the AI coach gets them as computed facts.

### Scores (computed in code, never by the LLM)

| Score | Formula |
|---|---|
| Impulse control | unflagged checked trades ÷ checked trades × 100. A trade is *checked* when the panic/FOMO check actually ran (`behaviorCheckedAt` on the trade). Shown from 3 checked trades |
| Diversification | 100 − the largest stock's share of the whole account. 100 when the account is all cash. The Advisor uses the same formula (`ai-service/services/portfolio_analytics.py` `diversification_score`, which rounds halves up like JavaScript so the two never differ by 1) |

Trades that were never checked (market data down, or made before detection existed) count neither way.

## 2. How a trade is checked

```
Buy/Sell → ledger saves the trade (cash and holdings logic is separate and unchanged)
        → detector: live quote + 5-day move + 52-week high (cached) → panic / FOMO rules
                    portfolio after the trade (cash + holdings)     → concentration rule
        → any hit is saved to behavioral_events; the trade is marked checked
        → the trade response waits at most 1.5 s:
             finished → { ..., behavior: [patterns] }  → the trade panel shows a note
             too slow → { ..., behavior: null }       → detection finishes in the background
```

- **A trade never fails because of detection.** Every step is caught and logged. If Finnhub or MongoDB is down,
  that check is skipped and the trade isn't marked checked.
- **Concentration also follows price moves.** Opening the app re-checks the user's concentration from current
  prices, at most every 15 minutes per user. A nightly job (weekdays 4:30 pm New York, `docs/AWS.md` §8) runs the
  same check for every user, so an account that drifted past 35% overnight is flagged the next evening.
- **AI coach:** `POST /api/patterns/analyze` sends the counts, scores and recent events with their numbers to the AI
  service. The LLM (Anthropic Claude API) returns a headline, a 2–3 sentence insight citing the user's own trades, and
  one habit to try (schema-validated). The prompt says the account is paper trading and the numbers are already
  computed. Without an API key, or if the call fails, a rule-based coach answers. Unchanged data reuses the saved
  insight without calling the LLM; fresh analyses are limited to 5 per hour per user.
- **Data cleanup:** resetting the paper account or deleting the account removes the user's events and coach results.

### API (all routes need a JWT; every query is filtered by the caller's user id)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patterns?type=&severity=&acknowledged=&limit=` | The user's patterns (limit capped at 100; bad filters → 400) |
| GET | `/api/patterns/summary` | Counts by type, unread count, largest position, scores |
| PATCH | `/api/patterns/:id/acknowledge` | Mark one as read (your own only; otherwise 404) |
| POST | `/api/patterns/acknowledge-all` | Mark all as read |
| DELETE | `/api/patterns/:id` | Dismiss one |
| GET | `/api/patterns/insight` | The last saved AI coaching, or `null` |
| POST | `/api/patterns/analyze` | Ask the AI coach (503 with a readable message if the AI service is down) |

Trade responses (`POST /api/store-purchase`) include `behavior`.

### Where data lives
- **`behavioral_events`** (written by Node): one document per detection.
- **`behavioral_patterns`** (written by the AI service's `PatternStore`): one summary per user per pattern type, plus
  the last coach insight. It has a unique index on `(user_id, pattern_type)`, which is why per-trade events never go
  there.

## 3. Rule versioning

Every event stores the `ruleVersion` it was graded under. When a rule changes, `RULE_VERSION` in `behaviorRules.js`
is bumped, and a clean-up at server start (`behaviorMigration.js`, repeat-safe, logs its counts) re-checks every older
panic/FOMO event from its stored facts:
- an event that no longer qualifies was a false alarm and is deleted, but its trade is first marked checked, so it
  still counts as a clean trade;
- the rest are re-graded to the current severity.

| Version | Change |
|---|---|
| v1 | Panic sell after a 5-day drop of 5%+; FOMO buy within 5% of the 52-week high; overconcentration over 35% of cash + holdings |
| v2 | FOMO needs a 5%+ run-up (or any 15%+ run-up); no panic flag at or above average cost; today's move and intraday high count; impulse score over checked trades only |
| v3 | The 5-day move comes from the site's own daily closes (`price_snapshots`, saved by the nightly job) once 6 recent closes exist: the newest at most 5 days old and the 6 spanning at most 8 calendar days, so a missed job day never passes off a longer window as "5 days". Otherwise Finnhub, exactly as v2. Thresholds unchanged |

Tests: `rule v3: 5-day move from our own daily closes` (`tests/nightlyJob.test.js`) covers each boundary: 5 closes
fall back, a stale newest close falls back, a gap falls back, bad rows are never used. `behavior rule clean-up`
(`tests/behavior.test.js`) covers delete / re-grade / repeat runs.

## 4. Bugs fixed

Each was found in live testing or in a browser check, fixed, and covered by a test that fails without the fix.

| # | Symptom | Cause | Fix | Test |
|---|---|---|---|---|
| 1 | The Advisor told a mostly-cash account to "trim INTC": INTC was 9.5% of the account but shown as 43.9% | Weights were shares of invested money only; cash was ignored | Weights are shares of the whole account; both numbers are shown and labelled | `test_live_account_weights_include_cash`, `test_rule_based_advice_does_not_tell_the_live_account_to_trim_intc` (pytest); `AI Advisor gets the whole account` (Jest) |
| 2 | The Advisor and the Mirror showed different Diversification scores for the same account | The LLM produced its own score | One formula, computed in code in Node and Python; the LLM's number is overwritten | `test_advisor_uses_cash_overrides_claudes_score_and_rules_out_taxes`, `test_diversification_rounds_like_javascript` |
| 3 | Ordinary index-fund buys near a high (SPY, 1.0% under the high, +1.7% in 5 days) were flagged as FOMO | FOMO only looked at distance from the 52-week high | A run-up of 5%+ is required (rule v2) | `the live-test SPY buy (1.0% under the high, +1.7% in 5 days) is not flagged` |
| 4 | Selling at a profit after a dip was flagged as a panic sell | The panic rule ignored cost | No flag at or above average cost; one cent below still flags | `selling at or above average cost is not a panic sell; one cent below is` |
| 5 | A crash today wasn't seen until Finnhub's daily figure updated | Only the 5-day daily figure was used | Today's move and intraday high from the live quote count too | `today's drop counts, taking the larger of the 5-day and today's drop`, `today's rise and today's intraday high are used` |
| 6 | Old trades, made before detection existed, inflated the impulse score as "clean" | The score divided by all trades | Only checked trades count (`behaviorCheckedAt`) | `impulse control = UNFLAGGED checked trades / checked trades (4 checked, 1 flagged -> 75)` |
| 7 | A stock that grew past 35% from price moves alone was never flagged | Concentration ran only after a trade | Re-checked from prices (at most every 15 minutes per user), and nightly for every user | `price moves alone create and clear warnings, at most once per 15 minutes`; `nightly check: every user with trades…` |
| 8 | Dates were a day off for US evening trades | Dates were formatted in UTC | The browser's time zone is sent and used | `a valid browser time zone is passed to the AI coach, a bad one is dropped`; `test_history_is_in_time_order_with_dates_in_the_users_time_zone` |
| 9 | The coach and Advisor mentioned taxes | The prompts didn't say the account is paper trading | Both prompts say paper trading, no taxes or fees | `test_coach_dates_use_the_users_time_zone_and_prompts_rule_out_taxes` |
| 10 | Two pattern cards looked like duplicates | Cards showed only the date | Each card shows the time and share count | `each pattern carries its trade's share count and time` |
| 11 | Every page scrolled sideways by 366 px on phones after the unread count was added | The badge's screen-reader text escaped the menu's scroll area | Contained in the badge | Browser check at 375 px (no horizontal overflow on any page) |
| 12 | A false alarm deleted by the v2 clean-up made its trade disappear from the score | The event was deleted before its trade was marked checked | The trade is marked checked first | `the trade of a deleted false alarm stays as a clean checked trade` |
| 13 | A trade whose check failed after v2 went live could be marked "checked" by a later restart | The bulk marking step had no end date | It is bounded at the v2 launch time | `a trade made after rule v2 went live whose check did not run stays unchecked, even after two runs` |

Design problems caught before the feature shipped, so they never reached users:
- events can't go into `behavioral_patterns` (its unique index would have made the 2nd event fail silently);
- concentration measured against holdings alone would flag every first buy as "100%";
- a score of "impulsive patterns ÷ all patterns" made one FOMO buy "100% impulsive".

## 5. Limits
- **No backfill for trades made before detection existed.** Panic and FOMO depend on the price situation at the
  moment of the trade, which wasn't stored for those trades. The page says so.
- **Depends on Finnhub** until 6 daily closes exist for a stock. If it's down or rate-limited, that trade isn't
  checked (logged; the trade still goes through).
- **The drop is the larger of the 5-day and today's move, not their sum.** A slow fall plus a fall today can be
  under-counted (−3% over the previous days and −3% today shows as a 3% drop).
- **Deleting a pattern changes the impulse score**: delete currently means "this flag was wrong".

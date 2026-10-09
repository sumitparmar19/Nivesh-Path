# Nivesh-Path - Work Report: Phase 2C (Behavioral Mirror)

**Covers:** Phase 2C, from reviewing the planner's instructions to the merge.
**Merged to `main`:** PR #9 (merge commit `bdb2e87`), after all 10 CI checks passed.
**Tests now:** 238. That is 111 Jest (backend) + 31 pytest (AI service) + 94 Vitest (React) + 2 Playwright (real browser), up from 178.
**Size:** 40 files changed (+2,178 / -31 lines):
- backend and its tests: 13 files, +819;
- AI service: 6 files, +358;
- React: 16 files, +699;
- docs: the rest.

---

## 1. Summary

Phase 2C is the core idea of the project: **the app studies each user's own trades and shows them their habits.**

| Part | What it does |
|---|---|
| Detection | Every buy or sell is checked for **panic selling**, **FOMO buying** and **overconcentration**, using the price data at that moment |
| Trade note | If a trade is flagged, a short explanation appears under the trade panel straight away |
| Behavioral Mirror page | `/behavioral-mirror`: two scores, an AI coach, the list of detected patterns and a "how it works" section |
| AI coach | Explains the user's habits in plain words, citing their own trades, with one thing to try next time |
| Around the app | Sidebar item with an unread count, "Trading DNA" strip on Portfolio, What's new entry |

---

## 2. How the phase was run

1. **Review first.** I checked the planner's 2C file against the real code before writing anything (`docs/PHASE2C_REVIEW.md`).
   - It found **4 blocking problems** and about 15 places where the code snippets didn't match this codebase.
2. **Approved with changes.** The planner agreed with all four fixes and chose **option A** for overconcentration (cash + holdings). It also added three requirements:
   - wait at most about 1.5 seconds for detection, so the trade panel can show a note;
   - warn again about the same stock once it has fallen back under 35% and later climbs over it again;
   - add the fake test tickers as **new** tickers only.
3. **Built, tested and checked in a real browser, then merged** after CI passed.

### The 4 blocking problems in the original instructions, and the fixes

| # | Problem | What would have happened | Fix |
|---|---|---|---|
| 1 | Patterns were to be saved in `behavioral_patterns`, which the AI service already uses with a **unique index on (user, pattern type)** | The **2nd pattern ever saved would fail**, silently | New collection `behavioral_events`. The AI service's `PatternStore` keeps its role (coach insight + counts) |
| 2 | Panic sell needed daily price **candles** | Candles are **not on the free Finnhub plan**, so panic sell would never fire | Use Finnhub "basic financials": `5DayPriceReturnDaily` and `52WeekHigh`. The site already calls this endpoint, and the free plan includes it |
| 3 | Detectors switched **off** in test mode | CI could never test the feature | Detectors run on the fake test prices. Two new fake tickers trigger them |
| 4 | Concentration measured against **holdings only** | **Every first buy = 100% "high" warning** | Measured against **cash + holdings** (the whole $100k account) |

---

## 3. The detection rules (`src/lib/behaviorRules.js`)

All rules are **pure functions**: no database and no network. They are easy to test, and Phase 2D (the check before a trade) can reuse them unchanged.

| Pattern | When it triggers | Severity |
|---|---|---|
| **Panic sell** | A **sell** after the stock fell **5% or more in 5 days** | low ≥5% · medium ≥10% · high ≥20% |
| **FOMO buy** | A **buy** within **5% of the 52-week high** | low ≤5% · medium ≤3% · high ≤2% **and** up ≥15% in 5 days |
| **Overconcentration** | One stock is **over 35% of the whole account** (cash included) | low >35% · medium >50% · high >65% |

- **Panic sell also records the loss.** It saves the sale price against the user's average cost, e.g. "That was 9.8% below what you paid".
- **No duplicate warnings.** A new overconcentration warning is only saved if there is no active one for that stock, or the severity went up.
- **Warns again after recovery.** When the stock falls back to 35% or below (or is sold), its warning is marked cleared, so a later climb over 35% warns again.

### Scores (computed in code, never by the AI)
| Score | Formula | Notes |
|---|---|---|
| Impulse control | trades **without** a panic/FOMO flag ÷ all trades | Shown only from 3 trades; until then the page says "needs at least 3 trades" |
| Diversification | 100 − largest stock's share of the account | 100 when the account is all cash |

These replace the original formula, under which **one FOMO buy made a user "100% impulsive"**, whether they had made 1 trade or 200.

---

## 4. How a trade is checked (`src/lib/behaviorDetector.js`)

```
Buy/Sell → ledger saves the trade (cash logic unchanged)
        → detector: 52-week high + 5-day return (cached) → panic / FOMO rules
                    portfolio after the trade (cash + holdings) → concentration rule
        → saves any hits to behavioral_events
        → trade response waits at most 1.5 s:
             finished → { ..., behavior: [patterns] }  → trade panel shows a note
             too slow → { ..., behavior: null }       → detection finishes in the background
```

**A trade can never fail because of detection:**
- every step is caught and logged;
- if Finnhub or MongoDB is down, that check is skipped;
- the detector's database model is set to fail at once instead of waiting 10 seconds for a connection.

Tests cover a slow detector, a broken detector and a missing market-data service.

---

## 5. API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/patterns?type=&severity=&acknowledged=&limit=` | The user's patterns (limit capped at 100; bad filters → 400) |
| GET | `/api/patterns/summary` | Counts by type, unread count, largest position, scores |
| PATCH | `/api/patterns/:id/acknowledge` | Mark one as read (only your own; otherwise 404) |
| POST | `/api/patterns/acknowledge-all` | Mark all as read |
| DELETE | `/api/patterns/:id` | Dismiss one (only your own) |
| GET | `/api/patterns/insight` | Last saved AI coaching (or `null`, never an error) |
| POST | `/api/patterns/analyze` | Ask the AI coach (503 with a readable message if the AI service is down) |

- **All routes need a login**, and every query is filtered by the user's id.
- **Trade responses** (`POST /api/store-purchase`) now include `behavior`.
- **Data cleanup:** reset and account deletion remove the user's patterns from both collections.

---

## 6. AI coach (FastAPI)

- **New endpoints:** `POST /api/ai/behavior/{user_id}` and `GET /api/ai/behavior/{user_id}`.
- **What Claude receives:** counts, scores and the user's recent patterns with their numbers. For example: "Sold TSLA at $180.50 after a -12.4% 5-day move (-9.75% vs your average cost)". The prompt says the numbers are already computed and must not be recalculated.
- **What it returns:** structured output (`BehaviorCoaching`) with a **headline**, a 2-3 sentence **insight** in second person citing the user's trades, and **one habit to try**.
- **Fallback:** a rule-based coach answers when there's no API key or Claude fails, and Claude isn't called at all when there's nothing to analyse.
- **Durable:** the result and per-type counts are saved to `PatternStore` (MongoDB), so the page shows the last insight after a deploy without calling Claude again.

---

## 7. React UI

| Where | What |
|---|---|
| `/behavioral-mirror` (new page) | Score meters, AI coach card ("Get my insight" / "Refresh", AI vs rule-based label), filter tabs with counts, pattern cards (Got it, Dismiss, Mark all read), "How patterns are detected", honest note about older trades |
| Trade panel (stock page) | Note under the order when the trade is flagged, with a link to the page |
| Sidebar | "Behavioral Mirror" item with a red count of new patterns |
| Portfolio | "Trading DNA" strip: impulse control, diversification, patterns found, link |
| What's new | Phase 2C entry; removed from the roadmap |

Built with the existing design tokens, so light/dark mode and the theme switch work.

---

## 8. Testing

| Suite | Count | New | Covers |
|---|---|---|---|
| Jest | 111 | +32 | Every severity boundary; dedup and re-warning; slow/broken detector never hurts a trade; auth on every route; users can't see or change each other's patterns; filters and limit cap; scores; what is sent to the AI; reset/delete cleanup |
| pytest | 31 | +8 | Claude prompt holds the user's numbers; no Claude call when nothing to analyse; fallback on API error and without a key; saved and returned per user; deleted with the user's memory; bad input → 422 |
| Vitest | 94 | +19 | Pattern cards (wording from real numbers, read/dismiss), page (scores, empty state, filters, actions, AI coach, errors), trade-panel note |
| Playwright | 2 | +1 | Sign up → buy the fake FOMO stock → note appears → Behavioral Mirror shows a high FOMO buy and an unread count → AI coach answers → mark read clears the count |

- **The tests catch real bugs.** I broke the rules on purpose (changed a severity boundary, removed the dedup check): the new tests failed both times.
- **Existing tests:**
  - all 79 Jest and 23 pytest tests pass unchanged;
  - two Vitest checks were updated because the feature changed what they checked: Behavioral Mirror moved from the roadmap to the release notes, and the theme test now finds its save request by type since the sidebar makes an extra request.
- **Fake test data:** two **new** made-up tickers, `FOMO` (triggers a high FOMO buy) and `DROP` (triggers a medium panic sell). Existing fake prices are unchanged.
- **CI:** the browser test ran against a real MongoDB database and the real AI service. All 10 checks passed.

### Browser check (before merging)
`/behavioral-mirror` and `/portfolio` at desktop and phone size (375px), light and dark. It found and fixed:
1. The new page returned a **404 status**. It still displayed, because the server's fallback serves the app, but the server didn't know the route. Now registered.
2. **Every page scrolled sideways by 366px on phones.** The hidden screen-reader text in the new unread count escaped the menu's scroll area.
3. Smaller fixes: score meters stacked so "50 / 100" doesn't wrap; "0.0% above what you paid" now reads "about what you paid"; tighter count tiles on small phones.

Final result: no sideways scrolling and no JavaScript errors in any view.

---

## 9. Not done / limits
- **No backfill for older trades.** Panic and FOMO depend on the price situation *at the moment of the trade*, which wasn't stored for trades made before 2C. The page says so.
- **Depends on Finnhub.** If it's down or rate-limited, that trade isn't checked (logged; the trade still goes through).
- **Cold start (still open):** new users have no history. The plan's idea of a demo account or CSV import of real broker history is still to do.

## 10. To-dos for Sumit
1. After the deploy, open `/behavioral-mirror`, make a trade or two, and click **Get my insight**.
2. In DigitalOcean, add **`MONGO_URL` to the ai component**. Without it the AI coach can't save its last insight and the AI memory isn't durable.
3. Still open from before: delete `STRIPE_SECRET_KEY`. Optional: `RESEND_API_KEY` + `CONTACT_TO_EMAIL`.

## 11. Next: Phase 2D
The pre-trade check can call the same rules **before** the order is placed, to show "this looks like a FOMO buy" while the user can still change their mind. Then comes the portfolio stress test.

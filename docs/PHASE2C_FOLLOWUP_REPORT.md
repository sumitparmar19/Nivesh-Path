# Nivesh-Path - Work Report: Phase 2C follow-up (live-test fixes)

**Covers:** the fixes for "Phase 2C follow-up: issues found in live testing", built as approved in `docs/PHASE2C_FOLLOWUP_REVIEW.md` with your four changes.
**Branch / PR:** `claude/project-overview-resources-vgzpog` → PR to `main` (Phase 2D waits until this is merged).
**Tests now:** 278, up from 238:
- Jest (backend): 131 (+20);
- pytest (AI service): 39 (+8);
- Vitest (React): 106 (+12);
- Playwright (real browser): 2.

---

## 1. Summary

| Item | Status | One-line result |
|---|---|---|
| A1 Advisor ignores cash | **Fixed** | Weights are shares of the whole account. Your test account: INTC is 9.5% (43.9% of invested money, labelled) and no "trim INTC" |
| A2 Two Diversification scores | **Fixed** | One formula, computed in code on both pages (your account: 90); Claude can't change it |
| A3 FOMO too broad | **Fixed** | Needs a 5%+ run-up; your SPY buys are no longer flagged |
| A4 Dates off by a day | **Fixed** | Dates use the browser's time zone (10:16 PM Pacific shows as Oct 8) |
| A5 Tax wording | **Fixed** | Both prompts say paper trading, no taxes |
| A6 History out of order | **Fixed** | Oldest first |
| A7 Cards look like duplicates | **Fixed** | Each card shows the time and "bought 4 shares" |
| B1 Daily-only data | **Fixed** (see limits) | Today's move and intraday high are used too |
| B2 Panic sell at a profit | **Fixed** | No flag at or above average cost |
| B3 Old trades inflate the score | **Fixed** | Score counts only checked trades |
| B4 Concentration only on trades | **Fixed** | Also re-checked from price moves (at most every 15 minutes) |
| B5 AI cost / access | **Fixed** | 5 fresh coach analyses per hour; unchanged data is free; `AI_INTERNAL_TOKEN` added |
| B6 "Got it" / unread count | **Not a bug found**; made clearer | Cards say "New" or "Read"; the page shows "N new · M read" |

## 2. Your four changes: confirmed

| # | Change | Confirmed | Test |
|---|---|---|---|
| 1 | Impulse control = **unflagged** checked trades ÷ checked trades | Yes. The review's wording was a slip; the code was and is unflagged ÷ checked. Higher = better | "4 checked, 1 flagged → 75" (plus 10/0 → 100 and 3/3 → 0) |
| 2 | What-if holdings must not inflate the account | Yes, in a slightly broader form. The account keeps its **real total**, and cash = real total − value of the what-if holdings (never below 0). Adding a holding spends cash; removing one frees it | Adding 10 NVDA at $180 to your account → cash $76,498.38; removing INTC → cash $87,828.50; a what-if bigger than the account → cash $0; plus an end-to-end check that cash + holdings = $100,000 |
| 3 | Run-up ≥ 15% is at least "low", even far from the high | Yes, built. One edge case to know: a 15% bounce after a crash also counts. That's still chasing a fast move, and "low" fits it | 20% run-up at 10% under the high → low; 14.99% there → no flag; 16% with no 52-week high known → low |
| 4 | Clean-up marks the trade checked **before** deleting a false alarm | Yes | Your SPY case: the event is deleted and the trade keeps `behaviorCheckedAt`, so it counts as a clean trade; a pre-2C trade with no event stays unchecked |

**The tests catch real bugs.** I broke each change on purpose:
- changes 1, 2 and 3 each made tests fail;
- the first change-4 test still passed when broken, because the post-launch bulk marking also covered its trade. I re-dated that trade so the test checks change 4 on its own, and it now fails when change 4 is removed;
- breaking B2 also made tests fail.

## 3. Decisions applied
1. **FOMO thresholds** as in the review, with **no index-fund exception**, plus change 3.
2. **Old events:** the ones that no longer qualify are deleted and the rest re-graded. Counts are logged at start-up, e.g. `[behavior] rule v2 clean-up: {"checked":…,"deleted":…,"regraded":…,"unchanged":…,"tradesMarked":…}`.
3. **`AI_INTERNAL_TOKEN`** is added now (see section 6 for setup).

---

## 4. The rules now (`src/lib/behaviorRules.js`, pure functions, `RULE_VERSION = 2`)

**Moves (B1):**
- **Drop** = the larger of the two drops: the 5-day return or today's change.
- **Run-up** = the larger of the two rises.
- **52-week high** = the higher of Finnhub's figure and today's intraday high.

| Pattern | Rule |
|---|---|
| **Panic sell** | A sell **below your average cost** after a drop of 5%+ → low; 10%+ → medium; 20%+ → high. At or above cost → no flag |
| **FOMO buy** | Run-up < 5% → no flag. Within 5% of the high → low; run-up 10%+ and within 3% → medium; run-up 15%+ and within 2% → high. Further than 5% from the high: run-up 15%+ → low |
| **Overconcentration** | Unchanged: one stock over 35% / 50% / 65% of cash + holdings |

### Scores
| Score | Formula |
|---|---|
| Impulse control | **unflagged checked trades ÷ checked trades**. A trade is "checked" when the panic/FOMO check really ran (`Purchase.behaviorCheckedAt`). Shown from 3 checked trades |
| Diversification | 100 − largest stock's share of the whole account, **the same formula in Node and Python**. Python rounds halves up like JavaScript, so they never differ by 1 |

## 5. What changed, by area

**Backend (Node)**
- `behaviorDetector.js`:
  - reads the live quote too (today's change, intraday high);
  - saves `quantity` and `ruleVersion` with each event;
  - marks the trade `behaviorCheckedAt` when the check ran;
  - `checkPrices()` handles concentration from price moves (B4), at most every 15 minutes per user.
- `behaviorMigration.js` (new): the start-up clean-up. It runs after MongoDB connects and is safe to repeat. It:
  - re-grades old events;
  - marks a false alarm's trade checked, then deletes the event;
  - marks every trade since the 2C launch (Oct 9, 02:13 UTC) as checked.
- `routes/patterns.js`:
  - scores over checked trades;
  - each pattern comes with its trade's quantity and time;
  - a stale flag on the saved insight;
  - 5 fresh analyses per hour, and unchanged data returns the saved insight without calling Claude;
  - the browser time zone is passed on;
  - the price-move check runs on summary load.
- `routes/ai.js`: the Advisor sends `cash_balance` (what-if adjusted, change 2) and the time zone.
- `aiClient.js` / `config.js`: sends `X-Internal-Token` when `AI_INTERNAL_TOKEN` is set.
- Models: `Purchase.behaviorCheckedAt` and `BehaviorEvent.ruleVersion`.

**AI service (Python)**
- `compute_metrics(holdings, cash)` returns:
  - `cash`, `account_value`, `cash_pct`;
  - per position `weight_pct` (share of the account) and `invested_weight_pct` (share of invested money);
  - `concentration_level` (the Mirror's bands) and `diversification_score`.
- After Claude answers, its Diversification number is **overwritten** with the computed one (A2).
- Prompts:
  - weights are account shares and cash is a choice, not a risk;
  - the HHI "2,500" rule is removed;
  - **paper trading, never mention taxes** (Advisor and coach).
- AI memory: the exact trade time is kept (no date baked into the text). History is listed **oldest first** in the **user's time zone**, or labelled "UTC" when none is known.
- Coach: dates in the user's time zone; texts use the new facts ("12.4% drop, 9.8% below your average cost"); the fingerprint is stored with the insight.
- Middleware: with `AI_INTERNAL_TOKEN` set, everything except `/health` needs the token (constant-time comparison).

**React**
- Advisor:
  - "Account value" with cash and its share;
  - "INTC · 9.5% of your account (43.9% of invested money)";
  - Diversification from the computed metric;
  - history "oldest first";
  - tiles in a 2×2 grid.
- Pattern cards: date **and time**, "bought 7 shares" (or "from price changes"), a clear **New / Read** label, "today" or "in 5 days" wording.
- Behavioral Mirror:
  - "N new · M read";
  - "4 of your 5 checked trades…", with a note about older unchecked trades;
  - "Your patterns changed since this insight. Refresh it.";
  - updated rule descriptions.
- The browser's time zone is sent with Advisor and coach requests.
- What's new: a "Fairer Behavioral Mirror, and an Advisor that counts your cash" entry.

**Config / docs**
- `.env.example`, `.do/app.yaml`, `docs/DEPLOYMENT.md`: `AI_INTERNAL_TOKEN`, with the order to set it in.
- `docker-compose.yml`: AI port bound to `127.0.0.1`.
- CLAUDE.md rules updated.
- `PHASE2_PLAN.md` notes updated.

## 6. Testing

| Suite | Count | New | Covers |
|---|---|---|---|
| Jest | 131 | +20 | Every new boundary (FOMO 4.99/5/10/15, 2.01% vs 2%, 15% far from the high), B2 at cost vs one cent below, B1 today's crash, regrade of your SPY event, start-up clean-up (delete/regrade/idempotent/change 4), price-move concentration and its 15-minute limit, card trade info, rate limit + reuse + stale, time zone validation, Advisor gets cash (+ what-if), internal-token header |
| pytest | 39 | +8 | Your live account → INTC 9.53% of account / 43.91% of invested, concentration "none", Diversification 90, no "trim INTC"; Claude's 40 overwritten with 90; no "2500" and a tax ban in the prompt; history oldest first, "2026-10-08 10:16 PM" for Los Angeles, "UTC" fallback; token required when set, `/health` open |
| Vitest | 106 | +12 | Advisor account vs invested labels, cash row, old saved analyses still render; card time/shares, New/Read, "today" wording, price-move label; Mirror "N new · M read", stale hint + refresh with time zone |
| Playwright | 2 | 0 | Both journeys pass with `AI_INTERNAL_TOKEN` set on both services (the AI service refuses a request without it: 401) |

**Existing tests that changed (on purpose):**
- the 2C rule tests encode the old thresholds, so they were rewritten for v2 as the review planned;
- five assertions changed because the wording changed: card text, "checked trades", and the Advisor request now includes the time zone.

**Browser check:**
- I copied your test trades (SPY 4 + 7, MSFT 7, INTC 89, plus the fake FOMO stock) at desktop and 375px, light and dark: no overflow and no JS errors.
- The Advisor and the Mirror both showed Diversification **80** for that account. It's 80 rather than 90 because the fake prices differ from the live ones.
- History was oldest first with Pacific times.

## 7. Limits (please read)
- **B1 under-counts some combined moves.** The drop (or run-up) is the **larger** of the 5-day move and today's move, not their sum. So a slow fall plus a fall today can be under-counted.
  - Example: −3% over the previous days and −3% today shows as a 3% drop, not ~6%.
  - Why: Finnhub's 5-day figure may or may not already include today, and adding the two could count today twice.
  - When it matters: if Finnhub documents when the figure updates, this can be made exact.
- **"Checked" for trades made since 2C is set in bulk.** The clean-up marks every trade since the 2C launch as checked. A trade made while Finnhub was down in that window is counted as clean (rare). New trades are only marked when the check really ran.
- **Price-move concentration runs only when the user opens the app** (Portfolio, Mirror or any page with the sidebar). There's no background job for inactive users.
- **The live site wasn't checked from here** (this container can't reach it). B6 was checked in code and CI.
- **Old AI coach insights** that mention deleted false alarms show the "patterns changed" hint until refreshed.

## 8. To-dos for Sumit
1. **Set `AI_INTERNAL_TOKEN`** in DigitalOcean on **web** and **ai** with the **same value**, in one save (or web first):
   - make one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
   - if only **ai** has it, the Advisor and coach stop answering until **web** has it too.
2. After the deploy:
   - check the app logs for the `rule v2 clean-up` line, which shows how many old events were deleted or re-graded;
   - open the Advisor on your test account: INTC should show about 9.5% of the account and no "trim INTC";
   - open the Behavioral Mirror: the SPY cards should be gone and impulse control should count those trades as clean.
3. Still open: `MONGO_URL` on the ai component (needed for the saved coach insight), delete `STRIPE_SECRET_KEY`.

## 9. Next
After this is merged: **Phase 2D**, the check before a trade plus the stress test. It reuses `behaviorRules` (v2) before the order is placed.

# Phase 2C follow-up: review of the live-test findings

**What I checked:** every item in "Phase 2C follow-up: issues found in live testing", against `main` at commit `bdb2e87` (Phase 2C merged).
**Status:** review only. I'll build after you approve, and Phase 2D waits until this is merged.

**Verdict:**
- All 7 Part A items are real; the code confirms each one.
- Part B: B1–B5 are real gaps. B6 is not a code bug as far as I can tell, but I couldn't check the live site from here, so I propose a small change to make the read state visible.

| Item | Verdict | Severity |
|---|---|---|
| A1 Advisor ignores cash | **Confirmed** | High: the Advisor gives wrong advice |
| A2 Two "Diversification" scores | **Confirmed**, and worse than it looks: the Advisor's number is **made up by Claude** | High |
| A3 FOMO rule too broad | **Confirmed** | High: it drives the impulse score and contradicts the Advisor |
| A4 Dates off by one day | **Confirmed** (UTC date baked into the AI memory) | Medium |
| A5 Tax wording | **Confirmed** (comes from Claude; nothing in our code mentions tax) | Low, quick fix |
| A6 Trade history out of order | **Confirmed** (sorted by relevance, not time) | Low, quick fix |
| A7 Cards look like duplicates | **Confirmed** | Low, quick fix |
| B1 Daily-only price data | **Real gap** | Medium |
| B2 Panic sell at a profit | **Real gap**: I agree it shouldn't be flagged | Medium |
| B3 Old trades inflate impulse control | **Confirmed** | Medium |
| B4 Concentration only checked on trades | **Confirmed** (warning and clearing both wait for a trade) | Medium |
| B5 AI cost and access | **No limit on `/api/patterns/analyze`, confirmed.** The FastAPI service is **not public** on DigitalOcean | Medium |
| B6 "Got it" and unread count | **Not reproduced in code or CI**; likely already marked read | Low |

---

## Part A

### A1. The Advisor ignores cash (confirmed)
- **Code:** `src/routes/ai.js` sends only the holdings. `compute_metrics` in `ai-service/services/portfolio_analytics.py` divides each position by the **invested total**.
  - With your trades, INTC = $9,530 / $21,702 = 43.9%. That matches what you saw.
  - The system prompt also tells Claude that HHI above 2,500 is "concentrated", and HHI here is computed on invested money only (3,751). So Claude read "concentrated" twice.
- **Fix:**
  - The backend sends `cash_balance` with every analysis (from the same ledger summary the Portfolio page uses). For what-if holdings edited on the Advisor page, it sends the real cash.
  - `compute_metrics` adds `cash`, `account_value` (cash + holdings) and `cash_pct`. Each position gets **`weight_pct` = share of the whole account**, the same base as the Mirror and the Portfolio page. It also keeps **`invested_weight_pct`**, labelled "share of invested money".
  - Concentration uses **the same bands as the Mirror** (largest stock over 35% / 50% / 65% of the account). HHI is computed on account weights; the "2,500" rule is removed from the prompt.
  - Prompt: "Weights are shares of the whole account including cash. A large cash share is a choice, not a risk."
  - **Advisor page:** the metrics show "INTC 9.5% of account (43.9% of invested money)", and the cash share is shown as its own row.
- **Test (as you asked):** your exact portfolio ($78,298.38 cash, the SPY/MSFT/INTC lots) must give INTC ≈ 9.5% of the account, no concentration risk, and no "trim INTC" recommendation in the rule-based answer. Plus a backend test that the cash balance is sent.

### A2. Two different "Diversification" scores (confirmed, worse than it looks)
- **Code:**
  - With Claude, the Advisor's `diversification_score` is a field **Claude fills in itself**. That breaks our own rule "don't do arithmetic in the LLM".
  - Without Claude (fallback), it's `100 − HHI/100`.
  - The Mirror uses `100 − largest stock's share of the account`.
  - So there are three possible numbers for one name.
- **Fix: one definition, computed in code, used everywhere:** Diversification = 100 − largest single stock's share of the whole account.
  - The AI service computes it in `compute_metrics` and **overwrites** whatever Claude returns, so the model can't change it. The prompt says it is given, not estimated.
  - The shared rules live in Node (`behaviorRules.scores`); the Python version gets a test with the same example numbers, so the two can't drift apart.
  - Your test account would show **90** on both pages.

### A3. The FOMO rule is too broad (confirmed)
- **Code:** today a buy within 5% of the 52-week high is enough. The run-up only raises severity to "high". Your SPY buys (1.0% from the high, +1.7% in 5 days) were "medium" by design, and that design is wrong.
- **Proposed rule** (pure function, run-up = see B1):

| Condition | Result |
|---|---|
| run-up **< 5%** or more than 5% under the 52-week high | **no flag** |
| run-up ≥ 15% and within 2% of the high | **high** |
| run-up ≥ 10% and within 3% of the high | **medium** |
| any other case with run-up ≥ 5% and within 5% of the high | **low** |

- **What this means in practice:**
  - **Your SPY buys:** no flag.
  - **SPY in general:** rarely flagged, only after a 5%+ week. For a broad index that really is a notable move, so I don't propose a separate index-fund exception (simpler to explain, and the same rule for every ticker).
  - **Boundary tests:** run-up 4.99 → none; 5.0 → low; within 3% + run-up 10 → medium; within 2% + run-up 15 → high; within 2.01% + run-up 20 → medium.
- **FOMO events already saved under the old rule:**
  - Every stored event kept its numbers (`percentFromHigh`, `fiveDayReturn`), so the new rule can be re-run on it exactly. **Proposal:** a one-time, safe-to-repeat clean-up when the server starts.
    - Events that no longer qualify are **deleted**: they were false alarms, and keeping them would keep the impulse score wrong.
    - Events that still qualify get their **severity re-graded**.
    - Every event is marked `ruleVersion: 2`, so it never runs twice. The counts are logged.
  - The same clean-up applies to panic sells under B2.
  - The saved AI coach text may mention deleted events, so the coach card shows "Your patterns changed since this insight. Refresh it." whenever patterns changed after the insight's date.

### A4. Dates off by one day (confirmed)
- **Code:** `transaction_to_document` writes `tx.timestamp.date()` into the memory text, and that's the **UTC** date. Your 10:16 PM Pacific trade on Oct 8 is 05:16 UTC on Oct 9.
- **Fix:**
  - Store the exact timestamp as metadata instead of a date in the text.
  - The browser sends its time zone (e.g. `America/Los_Angeles`) with each Advisor request.
  - The AI service formats dates in that time zone (Python `zoneinfo`) when it builds the prompt and the "From your trade history" list.
  - If no time zone is sent, the dates are labelled "UTC".
  - Existing memory is rebuilt automatically at the next deploy (the boot-time rebuild), so old entries get fixed too.

### A5. Tax wording (confirmed)
- **Code:** the wording comes from Claude; nothing in our code mentions taxes.
- **Fix:**
  - Both prompts (Advisor and coach) say: "This is a paper-trading account with virtual money: no taxes, fees or real money are involved; never mention tax consequences."
  - A test checks that the line is in the prompts.

### A6. Trade history out of order (confirmed)
- **Code:** past trades come back in order of relevance to the question.
- **Fix:**
  - Retrieval still picks the relevant trades, then sorts them **by time (oldest first)** before they go into the prompt and the "From your trade history" list.
  - A test covers this.

### A7. Cards look like duplicates (confirmed)
- **Fix:**
  - New events store `quantity` in their facts.
  - For existing events, the list route looks up the trade's quantity and time via `tradeId` (one extra query per page, only your own trades).
  - The card shows **"Oct 8, 2026, 10:16 PM · 4 shares"**.
  - Overconcentration found from a price move (B4) shows "from price changes" instead of a share count.

---

## Part B

### B1. Price data freshness (real gap)
- **What we use:** Finnhub's "basic financials" (`5DayPriceReturnDaily`, `52WeekHigh`) are based on daily closes, and our cache adds up to 1 hour.
  - So a crash or spike **today** can be missed until the next day's data.
  - I can't see Finnhub's exact update time from here, so I'm treating it as daily.
- **Fix: combine with the live quote**, which the trade already fetches (60-second cache):
  - **Today's move** = the quote's change vs the previous close (`dp`).
  - **Run-up** for FOMO = the larger of (5-day return, today's move).
  - **Drop** for panic = the larger drop of the two.
    - I use "the larger of the two" rather than adding them, because I can't be sure whether Finnhub's 5-day figure already includes today. Adding could count today twice; taking the larger never over-counts.
  - **52-week high** = the higher of Finnhub's figure and today's intraday high (`h`).
  - Example: a stock down 7% today but flat over 5 days now counts as a 7% drop.
- **Facts saved:** both inputs (`fiveDayReturn`, `todayChange`), so the card can say "fell 7.0% today".

### B2. Panic sell at a profit (agree: no flag)
- **Why:** a panic sell means fear-driven selling that **locks in a loss**. Selling above your average cost after a dip is taking profit; that's a different habit, not panic.
- **Fix:**
  - **No panic flag when the sale price is at or above your average cost.**
  - Below cost, the severity bands stay as they are (5 / 10 / 20% drop).
  - If the average cost is unknown (shouldn't happen, since the ledger always has it), it falls back to today's rule.
- **Tests:** sale at cost → none; 0.01 below cost with a 5% drop → low.
- **Old panic events:** re-run through the same start-up clean-up (they stored `vsCostPct`).

### B3. Old trades inflate impulse control (confirmed)
- **Code:** the score divides by **all** trades (`Purchase.countDocuments`), so trades made before 2C, or made while Finnhub was down, count as "clean".
- **Fix:**
  - After the panic/FOMO check actually runs, the detector marks the trade `behaviorCheckedAt` (a new field on the trade; cash logic is untouched).
  - **Impulse control = flagged checked trades ÷ checked trades.**
  - It's shown from **3 checked trades**; until then the page says "Needs 3 checked trades (you have N)".
  - Unchecked trades aren't counted at all, either way.

### B4. Concentration is only checked when the user trades (confirmed)
- **Code:**
  - A stock that grows past 35% through price alone is never warned about until the next trade.
  - Equally, a warning is only cleared on a trade.
- **Fix:**
  - Run the **concentration check alone** (it needs no extra market data, just the portfolio at live prices) when the user opens the **Portfolio** page or the **Behavioral Mirror**.
  - It's limited to **once per 15 minutes per user**, using the same dedup/clear logic.
  - These events have no trade and are labelled "from price changes".
- **Not proposed:** a background job for users who don't log in. Nobody would see the warning anyway, and it costs Finnhub calls.

### B5. AI cost and access (one gap, one already safe)
- **Rate limit: confirmed missing.** `POST /api/patterns/analyze` has no limit, while the Advisor has 10 per minute.
  - **Fix:** 5 per hour per user.
  - Also, if nothing changed since the last insight (same events and scores), **return the saved insight without calling Claude**. Refresh is then free when nothing is new.
- **Is FastAPI public? No.**
  - In `.do/app.yaml`, the `ai` component has only `internal_ports: [8001]` and no `routes`, so DigitalOcean doesn't expose it to the internet. Only the web component can reach it.
  - `docker-compose.yml` publishes port 8001 on the developer's own machine (local only).
- **Defence in depth (small, recommended):**
  - A shared secret `AI_INTERNAL_TOKEN`. The backend sends it as a header and FastAPI rejects requests without it **when it's set**. It's optional, so local dev and tests keep working.
  - The compose file binds 8001 to `127.0.0.1` only.
  - You'd add one encrypted env var to both components in DigitalOcean.

### B6. "Got it" button and unread count (not reproduced)
- **Code:**
  - "Got it" shows whenever a pattern is unread (`acknowledged: false`, the default for every new event).
  - The sidebar count is the unread total.
  - Nothing marks patterns as read automatically: only **Got it** and **Mark all read** do.
- **CI evidence:** the Playwright test on PR #9 ran against a **real MongoDB** and asserts both, on a brand-new pattern:
  - the sidebar count shows "1";
  - the card has "Got it", and clicking it clears the count.
  - It passed.
- **Couldn't check live:** this container can't reach the live site (the network proxy blocks it).
- **Likely explanation:** **Mark all read** or **Got it** was clicked earlier. Read cards look only slightly faded, so that's easy to miss.
- **Small fix:**
  - Read cards show a clear **"Read"** label.
  - The page header shows "N new · M read".
- **Quick live check:** buy the same stock twice after this ships (only buys that qualify under the new rules will flag).

---

## Plan and tests (after approval)

| Step | Work |
|---|---|
| 1 | Rules (pure): new FOMO thresholds, panic only below cost, today's move + intraday high (B1), scores over checked trades (B3) |
| 2 | Detector/routes: `behaviorCheckedAt`, start-up clean-up of old events, price-move concentration check (15-min limit), card quantity/time lookup, analyze rate limit + skip-if-unchanged, optional `AI_INTERNAL_TOKEN` |
| 3 | AI service: cash-aware metrics (account vs invested weights), one Diversification formula in code (overwrites Claude's value), paper-trading prompt line, time-zone dates, time-ordered history |
| 4 | React: Advisor shows account % + invested %, cash row; cards show time + shares + "Read"; "patterns changed" hint on the coach |
| 5 | Tests for every changed rule and boundary, the cash test, migration test; browser check; docs; report like `PHASE2C_REPORT.md`; PR |

**Tests:**
- about +35, including your exact live portfolio as a fixture;
- the existing FOMO/panic boundary tests will be **rewritten** to the new thresholds, because they encode the old rule on purpose.

**New settings:** one optional encrypted env var, `AI_INTERNAL_TOKEN`, on both components. Nothing else.

## Decisions for you
1. **FOMO thresholds** as in the A3 table, with **no index-fund exception**. OK?
2. **Old events** under the old rules: **delete the ones that no longer qualify** and re-grade the rest (A3/B2). The alternative is keeping them with a "retired" label. I recommend delete.
3. **`AI_INTERNAL_TOKEN`:** add it now (recommended), or skip because the AI service isn't public anyway?

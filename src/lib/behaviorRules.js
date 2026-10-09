// Behavioral Mirror rules: pure functions that decide whether a trade (or the portfolio after it) shows a
// panic sell, a FOMO buy or overconcentration. No I/O here, so Phase 2D's pre-trade check can run the same
// rules before a trade, and tests can cover every severity boundary directly.

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };
const CONCENTRATION_LIMIT = 35; // % of total account value (cash + holdings) in one stock

const round2 = (n) => Math.round(n * 100) / 100;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Rule version stored on every event; the start-up clean-up re-checks older events with these rules.
const RULE_VERSION = 2;

// Daily figures (5-day return) can miss today's move, so both are used: the drop is the larger of the two
// drops and the run-up the larger of the two rises. Taking the larger one never counts today twice.
function moves({ fiveDayReturn, todayChange }) {
  const known = [fiveDayReturn, todayChange].filter(isNum);
  if (!known.length) return { drop: null, runUp: null };
  return { drop: Math.max(0, -Math.min(...known)), runUp: Math.max(0, Math.max(...known)) };
}

/**
 * Panic sell: selling at a loss (below your average cost) after the stock fell at least 5% in 5 days or
 * today. Selling at or above cost after a dip is taking profit, not panic.
 */
function panicSell({ side, symbol, price, fiveDayReturn, todayChange, avgCost, quantity }) {
  if (side !== "sell" || !isNum(price)) return null;
  const { drop } = moves({ fiveDayReturn, todayChange });
  if (drop === null || drop < 5) return null;
  const knownCost = isNum(avgCost) && avgCost > 0;
  if (knownCost && price >= avgCost) return null;
  const severity = drop >= 20 ? "high" : drop >= 10 ? "medium" : "low";
  const facts = { price: round2(price), drop: round2(drop), fiveDayReturn: isNum(fiveDayReturn) ? round2(fiveDayReturn) : null, todayChange: isNum(todayChange) ? round2(todayChange) : null };
  if (knownCost) {
    facts.avgCost = round2(avgCost);
    facts.vsCostPct = round2(((price - avgCost) / avgCost) * 100); // negative = sold at a loss
  }
  if (isNum(quantity)) facts.quantity = quantity;
  return { patternType: "panic_sell", severity, symbol, facts };
}

/**
 * FOMO buy: buying after a real short-term run-up (5%+ in 5 days or today), worse the closer to the
 * 52-week high:  run-up >= 15% and within 2% of the high -> high;  >= 10% and within 3% -> medium;
 * >= 5% and within 5% -> low;  >= 15% even further from the high -> low (still chasing a fast move).
 */
function fomoBuy({ side, symbol, price, week52High, dayHigh, fiveDayReturn, todayChange, quantity }) {
  if (side !== "buy" || !isNum(price) || price <= 0) return null;
  const { runUp } = moves({ fiveDayReturn, todayChange });
  if (runUp === null || runUp < 5) return null;
  const highs = [week52High, dayHigh].filter((h) => isNum(h) && h > 0);
  const high = highs.length ? Math.max(...highs) : null;
  const fromHigh = high ? Math.max(0, ((high - price) / high) * 100) : null; // a new high counts as 0%
  let severity = null;
  if (fromHigh !== null && fromHigh <= 5) {
    severity = fromHigh <= 2 && runUp >= 15 ? "high" : fromHigh <= 3 && runUp >= 10 ? "medium" : "low";
  } else if (runUp >= 15) {
    severity = "low";
  }
  if (!severity) return null;
  const facts = {
    price: round2(price), runUp: round2(runUp),
    week52High: high ? round2(high) : null, percentFromHigh: fromHigh === null ? null : round2(fromHigh),
    fiveDayReturn: isNum(fiveDayReturn) ? round2(fiveDayReturn) : null, todayChange: isNum(todayChange) ? round2(todayChange) : null,
  };
  if (isNum(quantity)) facts.quantity = quantity;
  return { patternType: "fomo_buy", severity, symbol, facts };
}

/**
 * Re-check an event saved under an older rule version, from its stored facts. Returns the event as the
 * current rules would grade it, or null if it no longer qualifies. Overconcentration is unchanged.
 */
function regrade(event) {
  const f = event.facts || {};
  if (event.patternType === "panic_sell") {
    return panicSell({ side: "sell", symbol: event.symbol, price: f.price, fiveDayReturn: f.fiveDayReturn, todayChange: f.todayChange, avgCost: f.avgCost, quantity: f.quantity });
  }
  if (event.patternType === "fomo_buy") {
    return fomoBuy({ side: "buy", symbol: event.symbol, price: f.price, week52High: f.week52High, fiveDayReturn: f.fiveDayReturn, todayChange: f.todayChange, quantity: f.quantity });
  }
  return { patternType: event.patternType, severity: event.severity, symbol: event.symbol, facts: f };
}

function concentrationSeverity(pct) {
  if (pct > 65) return "high";
  if (pct > 50) return "medium";
  if (pct > CONCENTRATION_LIMIT) return "low";
  return null;
}

/**
 * Each stock's share of the whole account (cash + holdings at current prices). Cash counts, so a first
 * small buy is never "100% concentrated".
 * positions: [{ symbol, market_value }]
 */
function concentration({ positions, cashBalance }) {
  const holdingsValue = positions.reduce((s, p) => s + (p.market_value || 0), 0);
  const totalValue = holdingsValue + Math.max(0, cashBalance || 0);
  if (!(totalValue > 0)) return [];
  return positions.map((p) => {
    const pct = round2(((p.market_value || 0) / totalValue) * 100);
    return {
      symbol: p.symbol,
      percent: pct,
      severity: concentrationSeverity(pct),
      facts: { positionValue: round2(p.market_value || 0), accountValue: round2(totalValue), percentOfAccount: pct },
    };
  });
}

/**
 * Should a new overconcentration event be saved? Only if there's no active event for that stock, or the
 * severity went up. An event stops being active once the position falls back under 35% (cleared), so a
 * later re-crossing warns again.
 */
function shouldRecordConcentration(latestActive, severity) {
  if (!severity) return false;
  if (!latestActive) return true;
  return SEVERITY_RANK[severity] > SEVERITY_RANK[latestActive.severity];
}

/**
 * Behavioral scores (0-100, higher is healthier), computed in code so the AI never does arithmetic.
 * impulseControl: share of CHECKED trades with no panic/FOMO flag (unflagged / checked); needs 3 checked
 *   trades. Trades that were never checked (before 2C, or market data down) don't count either way.
 * diversification: 100 minus the largest single stock's share of the whole account (cash included). The
 *   Advisor uses the same definition (ai-service portfolio_analytics.diversification_score).
 */
function scores({ checkedTrades, flaggedTrades, largestPercent }) {
  const enough = checkedTrades >= 3;
  const flagged = Math.min(flaggedTrades, checkedTrades);
  return {
    impulseControl: enough ? Math.round(((checkedTrades - flagged) / checkedTrades) * 100) : null,
    diversification: diversification(largestPercent),
    checkedTrades,
    flaggedTrades: flagged,
    enoughTrades: enough,
  };
}

/** 100 minus the largest single stock's share (%) of the whole account. */
function diversification(largestPercent) {
  return Math.max(0, Math.min(100, Math.round(100 - (largestPercent || 0))));
}

module.exports = { panicSell, fomoBuy, regrade, concentration, shouldRecordConcentration, scores, diversification, SEVERITY_RANK, CONCENTRATION_LIMIT, RULE_VERSION };

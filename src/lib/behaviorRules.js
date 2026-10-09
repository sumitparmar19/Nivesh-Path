// Behavioral Mirror rules: pure functions that decide whether a trade (or the portfolio after it) shows a
// panic sell, a FOMO buy or overconcentration. No I/O here, so Phase 2D's pre-trade check can run the same
// rules before a trade, and tests can cover every severity boundary directly.

const SEVERITY_RANK = { low: 1, medium: 2, high: 3 };
const CONCENTRATION_LIMIT = 35; // % of total account value (cash + holdings) in one stock

const round2 = (n) => Math.round(n * 100) / 100;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Selling after the stock fell at least 5% over the last 5 trading days. */
function panicSell({ side, symbol, price, fiveDayReturn, avgCost }) {
  if (side !== "sell" || !isNum(fiveDayReturn) || fiveDayReturn > -5) return null;
  const drop = -fiveDayReturn;
  const severity = drop >= 20 ? "high" : drop >= 10 ? "medium" : "low";
  const facts = { price: round2(price), fiveDayReturn: round2(fiveDayReturn) };
  if (isNum(avgCost) && avgCost > 0) {
    facts.avgCost = round2(avgCost);
    facts.vsCostPct = round2(((price - avgCost) / avgCost) * 100); // negative = sold at a loss
  }
  return { patternType: "panic_sell", severity, symbol, facts };
}

/** Buying within 5% of the 52-week high (high severity if it also ran up 15%+ in 5 days). */
function fomoBuy({ side, symbol, price, week52High, fiveDayReturn }) {
  if (side !== "buy" || !isNum(week52High) || week52High <= 0 || !isNum(price) || price <= 0) return null;
  const fromHigh = Math.max(0, ((week52High - price) / week52High) * 100); // a new high counts as 0%
  if (fromHigh > 5) return null;
  const runUp = isNum(fiveDayReturn) ? fiveDayReturn : 0;
  const severity = fromHigh <= 2 && runUp >= 15 ? "high" : fromHigh <= 3 ? "medium" : "low";
  return {
    patternType: "fomo_buy",
    severity,
    symbol,
    facts: { price: round2(price), week52High: round2(week52High), percentFromHigh: round2(fromHigh), fiveDayReturn: isNum(fiveDayReturn) ? round2(fiveDayReturn) : null },
  };
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
 * impulseControl: share of trades with no panic/FOMO flag (needs 3+ trades to mean anything).
 * diversification: 100 minus the largest single stock's share of the account.
 */
function scores({ tradeCount, flaggedTrades, largestPercent }) {
  const enough = tradeCount >= 3;
  return {
    impulseControl: enough ? Math.round((1 - Math.min(flaggedTrades, tradeCount) / tradeCount) * 100) : null,
    diversification: Math.max(0, Math.min(100, Math.round(100 - (largestPercent || 0)))),
    tradeCount,
    flaggedTrades,
    enoughTrades: enough,
  };
}

module.exports = { panicSell, fomoBuy, concentration, shouldRecordConcentration, scores, SEVERITY_RANK, CONCENTRATION_LIMIT };

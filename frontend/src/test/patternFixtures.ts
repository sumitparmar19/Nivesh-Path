// Behavioral Mirror fixtures shaped like the real /api/patterns responses.
import type { BehaviorInsight, Pattern, PatternSummary } from "../types";

export const PANIC: Pattern = {
  _id: "p1", patternType: "panic_sell", severity: "medium", symbol: "TSLA", tradeId: "t1", acknowledged: false, createdAt: "2026-10-03T10:00:00Z",
  facts: { price: 180.5, fiveDayReturn: -12.4, avgCost: 200, vsCostPct: -9.75 },
};
export const FOMO: Pattern = {
  _id: "p2", patternType: "fomo_buy", severity: "high", symbol: "NVDA", tradeId: "t2", acknowledged: true, createdAt: "2026-10-02T10:00:00Z",
  facts: { price: 140, week52High: 141, percentFromHigh: 0.71, fiveDayReturn: 16.2 },
};
export const CONC: Pattern = {
  _id: "p3", patternType: "overconcentration", severity: "low", symbol: "AAPL", tradeId: "t3", acknowledged: false, createdAt: "2026-10-01T10:00:00Z",
  facts: { positionValue: 40000, accountValue: 100000, percentOfAccount: 40 },
};

export const SUMMARY: PatternSummary = {
  totalPatterns: 3, unreadCount: 2,
  byType: { panic_sell: 1, fomo_buy: 1, overconcentration: 1 },
  largestPosition: { symbol: "AAPL", percent: 40 },
  scores: { impulseControl: 60, diversification: 60, tradeCount: 5, flaggedTrades: 2, enoughTrades: true },
};

export const EMPTY_SUMMARY: PatternSummary = {
  totalPatterns: 0, unreadCount: 0,
  byType: { panic_sell: 0, fomo_buy: 0, overconcentration: 0 },
  largestPosition: null,
  scores: { impulseControl: null, diversification: 100, tradeCount: 0, flaggedTrades: 0, enoughTrades: false },
};

export const INSIGHT: BehaviorInsight = {
  headline: "You tend to sell after sharp drops", insight: "You sold TSLA after a 12.4% drop.", suggestion: "Wait a day before selling after a drop.",
  ai_generated: true, model: "claude-opus-5-5", created_at: "2026-10-04T10:00:00Z",
};

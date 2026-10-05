// AI advisor payloads for tests (shape of AnalyzePortfolioResponse + saved history).
import type { AnalysisDetail, AnalysisResult, AnalysisSummary } from "../types";

export const RESULT: AnalysisResult = {
  metrics: {
    total_value: 11300, total_cost: 11000, total_unrealized_pl: 300, total_unrealized_pl_pct: 2.7, position_count: 2,
    largest_position: "TSLA", largest_weight_pct: 55.8, concentration_hhi: 5000,
    positions: [{ symbol: "TSLA", market_value: 6300, cost_basis: 6600, unrealized_pl: -300, unrealized_pl_pct: -4.5, weight_pct: 55.8 }],
  },
  insight: {
    summary: "Concentrated in two tech names.", risk_level: "high", diversification_score: 22,
    strengths: ["Clear conviction"], risks: ["Single-sector exposure"],
    recommendations: [{ action: "rebalance", symbol: "TSLA", rationale: "Over half the portfolio" }],
    answer: "Yes - TSLA is 56% of your money.",
  },
  ai_generated: true, model: "claude-opus-5-5", relevant_history: ["BUY 30 shares of TSLA at $220.00 on 2026-10-02"], analysisId: "a2",
};

export const HISTORY: AnalysisSummary[] = [
  { id: "a1", createdAt: "2026-10-01T10:00:00Z", question: "Should I rebalance?", riskProfile: "conservative", result: { insight: { risk_level: "medium", summary: "Older summary" } } },
];

export const DETAIL: AnalysisDetail = {
  id: "a1", createdAt: "2026-10-01T10:00:00Z", question: "Should I rebalance?", riskProfile: "conservative",
  holdings: [{ symbol: "NVDA", quantity: 40, avg_price: 110 }],
  result: { ...RESULT, insight: { ...RESULT.insight, summary: "Older summary", risk_level: "medium", answer: null }, analysisId: undefined },
};

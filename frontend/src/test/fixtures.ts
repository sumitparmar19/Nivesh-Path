// Realistic API payloads shared by page tests (shapes match the Express responses).
import type { PortfolioSummary, Trade } from "../types";

export const SUMMARY: PortfolioSummary = {
  cashBalance: 89200,
  totalDeposited: 100000,
  holdingsValue: 11300,
  totalValue: 100500,
  unrealizedPnl: 500,
  totalPnl: 500,
  totalPnlPercent: 0.5,
  positions: [
    { symbol: "NVDA", quantity: 40, avg_price: 110, current_price: 125, market_value: 5000, cost_basis: 4400 },
    { symbol: "TSLA", quantity: 30, avg_price: 220, current_price: 210, market_value: 6300, cost_basis: 6600 },
  ],
};

export const EMPTY_SUMMARY: PortfolioSummary = { ...SUMMARY, cashBalance: 100000, holdingsValue: 0, totalValue: 100000, unrealizedPnl: 0, totalPnl: 0, totalPnlPercent: 0, positions: [] };

export const TRADES: Trade[] = [
  { _id: "t1", name: "NVDA", price: 110, quantity: 40, total: 4400, transactionType: "buy", timestamp: "2026-10-01T15:00:00Z" },
  { _id: "t2", name: "TSLA", price: 220, quantity: 30, total: 6600, transactionType: "buy", timestamp: "2026-10-02T15:00:00Z" },
  { _id: "t3", name: "TSLA", price: 230, quantity: 5, total: 1150, transactionType: "sell", timestamp: "2026-10-03T15:00:00Z" },
];

export const MEMORY = { tradesInDatabase: 3, aiReachable: true, indexedTrades: 3, durableStorage: true, index: { status: "ok", users: 1, transactions: 3, seconds: 0.2 } };

// Types for every Nivesh-Path API response, written from the real Express/FastAPI responses
// (src/routes/*.js, ai-service/schemas.py). No `any`: the compiler catches any mismatch with the backend.

export type Theme = "light" | "dark";

export interface UserSettings {
  theme: Theme;
  language: string;
  notifications: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  nickname: string;
  country: string;
  city: string;
  address: string;
  cashBalance: number;
  settings: UserSettings;
  createdAt?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type ProfileUpdate = Partial<Pick<User, "name" | "nickname" | "email" | "mobile" | "country" | "city" | "address">>;

/** A trade as stored by the ledger (models/Stock1.js). `name` is the ticker. */
export interface Trade {
  _id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  transactionType: "buy" | "sell";
  timestamp: string;
  priceSource?: "live" | "client";
}

export interface TradeResult {
  success: boolean;
  newBalance: number;
  transaction: Trade;
  /** Behavioral Mirror patterns found in this trade; null if detection didn't finish within ~1.5s. */
  behavior?: TradeBehavior[] | null;
}

/** GET /api/portfolio/holdings */
export interface Holding {
  symbol: string;
  quantity: number;
  avg_price: number;
}

/** A position inside the wallet summary, valued at live prices. */
export interface Position extends Holding {
  current_price: number;
  market_value: number;
  cost_basis: number;
}

/** GET /api/portfolio/cash-balance */
export interface PortfolioSummary {
  cashBalance: number;
  totalDeposited: number;
  holdingsValue: number;
  totalValue: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalPnlPercent: number;
  positions: Position[];
}

export interface ResetResult {
  success: boolean;
  cashBalance: number;
  tradesRemoved: number;
}

// ---------- Market data (/api/stocks/*) ----------
export interface StockQuote {
  symbol: string;
  price: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  time: string | null;
}

export interface StockProfile {
  symbol: string;
  name: string;
  logo?: string | null;
  industry?: string | null;
  exchange?: string | null;
  country?: string | null;
  currency?: string | null;
  ipo?: string | null;
  marketCap?: number | null; // millions of USD
  website?: string | null;
  type?: string;
}

export interface StockMetrics {
  symbol: string;
  marketCap: number | null; // millions of USD
  peTTM: number | null;
  epsTTM: number | null;
  week52High: number | null;
  week52Low: number | null;
  beta: number | null;
  dividendYield: number | null;
  avgVolume10d: number | null; // millions of shares
}

export interface NewsItem {
  headline: string;
  source: string | null;
  url: string;
  datetime: number | null; // unix seconds
  summary: string | null;
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: string | null;
}

export interface CandlePoint {
  t: number; // unix seconds
  c: number;
}

export interface Candles {
  symbol: string;
  available: boolean;
  reason?: string;
  points?: CandlePoint[];
}

export interface CuratedSector {
  category: string;
  stocks: { symbol: string; name: string }[];
}

/** GET /search: Finnhub-style quotes for the 12 stocks that have a page. */
export interface RawQuote {
  c: number;
  d: number | null;
  dp: number | null;
  o?: number;
  h?: number;
  l?: number;
  pc?: number;
}

// ---------- AI advisor ----------
export type RiskProfile = "conservative" | "moderate" | "aggressive";
export type RiskLevel = "low" | "medium" | "high";

export interface Recommendation {
  action: "buy" | "sell" | "hold" | "rebalance" | "research";
  symbol?: string | null;
  rationale: string;
}

export interface AIInsight {
  summary: string;
  risk_level: RiskLevel;
  diversification_score: number;
  strengths: string[];
  risks: string[];
  recommendations: Recommendation[];
  answer?: string | null;
}

export interface PositionMetrics {
  symbol: string;
  market_value: number;
  cost_basis: number;
  unrealized_pl: number;
  unrealized_pl_pct: number;
  weight_pct: number;
}

export interface PortfolioMetrics {
  total_value: number;
  total_cost: number;
  total_unrealized_pl: number;
  total_unrealized_pl_pct: number;
  position_count: number;
  largest_position: string;
  largest_weight_pct: number;
  concentration_hhi: number;
  positions: PositionMetrics[];
}

export interface AnalysisResult {
  metrics: PortfolioMetrics;
  insight: AIInsight;
  ai_generated: boolean;
  model?: string | null;
  relevant_history: string[];
  disclaimer?: string;
  analysisId?: string;
}

export interface AdvisorHolding {
  symbol: string;
  quantity: number;
  avg_price: number;
}

export interface AnalysisSummary {
  id: string;
  createdAt: string;
  question: string | null;
  riskProfile: RiskProfile;
  result: { insight: { risk_level: RiskLevel; summary: string } | null };
}

export interface AnalysisDetail {
  id: string;
  createdAt: string;
  question: string | null;
  riskProfile: RiskProfile;
  holdings: AdvisorHolding[];
  result: AnalysisResult;
}

export type IndexStatus = "pending" | "running" | "ok" | "failed" | "disabled";

export interface AIMemory {
  tradesInDatabase: number;
  aiReachable: boolean;
  indexedTrades?: number;
  durableStorage?: boolean;
  index?: { status: IndexStatus; users: number; transactions: number; seconds: number };
}

// ---------- Watchlist, contact, status ----------
export interface WatchlistItem {
  symbol: string;
  addedAt: string;
}

export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
}

export interface SystemStatus {
  web: string;
  db: "connected" | "disconnected";
  ai: {
    reachable: boolean;
    llmConfigured?: boolean;
    model?: string | null;
    vectorIndex?: { status: IndexStatus; users: number; transactions: number; seconds: number } | null;
  };
  checkedAt: string;
}

// ---------- Behavioral Mirror (/api/patterns) ----------
export type PatternType = "panic_sell" | "fomo_buy" | "overconcentration";
export type Severity = "low" | "medium" | "high";

/** Numbers computed by the server's detectors (which ones are present depends on the pattern type). */
export interface PatternFacts {
  price?: number;
  fiveDayReturn?: number | null;
  avgCost?: number;
  vsCostPct?: number;
  week52High?: number;
  percentFromHigh?: number;
  positionValue?: number;
  accountValue?: number;
  percentOfAccount?: number;
}

export interface Pattern {
  _id: string;
  patternType: PatternType;
  severity: Severity;
  symbol: string;
  tradeId: string | null;
  facts: PatternFacts;
  acknowledged: boolean;
  clearedAt?: string | null;
  createdAt: string;
}

/** A pattern as returned inside a trade response (`behavior`). */
export type TradeBehavior = Pick<Pattern, "_id" | "patternType" | "severity" | "symbol" | "facts">;

export interface BehaviorScores {
  impulseControl: number | null; // null until 3+ trades
  diversification: number;
  tradeCount: number;
  flaggedTrades: number;
  enoughTrades: boolean;
}

export interface PatternSummary {
  totalPatterns: number;
  unreadCount: number;
  byType: Record<PatternType, number>;
  largestPosition: { symbol: string; percent: number } | null;
  scores: BehaviorScores;
}

export interface BehaviorInsight {
  headline: string;
  insight: string;
  suggestion: string;
  ai_generated: boolean;
  model?: string | null;
  created_at: string;
  disclaimer?: string;
}

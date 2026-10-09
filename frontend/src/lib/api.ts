// Typed client for every Nivesh-Path endpoint. Components never call fetch() directly: this adds the JWT,
// turns error bodies into readable messages, and sends a 401 back to the login page.
import type {
  AIMemory, AdvisorHolding, BehaviorInsight, Pattern, PatternSummary, PatternType, Severity, AnalysisDetail, AnalysisResult, AnalysisSummary, AuthResponse, Candles, ContactMessage,
  CuratedSector, Holding, NewsItem, PortfolioSummary, ProfileUpdate, RawQuote, ResetResult, RiskProfile, SearchResult,
  StockMetrics, StockProfile, StockQuote, SystemStatus, Trade, TradeResult, User, UserSettings, WatchlistItem,
} from "../types";
import { clearSession, readToken } from "./session";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function request<T>(path: string, method: Method = "GET", body?: unknown, auth = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = readToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError("Can't reach the server. Check your connection and try again.", 0);
  }
  if (res.status === 401 && auth) {
    clearSession();
    const here = window.location.pathname + window.location.search;
    if (!window.location.pathname.startsWith("/login")) {
      window.location.assign(`/login?redirect=${encodeURIComponent(here)}`);
    }
    throw new ApiError("Your session expired. Please log in again.", 401);
  }
  const data = (await res.json().catch(() => ({}))) as T & ErrorBody;
  if (!res.ok) throw new ApiError(data.error || data.message || `Request failed (${res.status})`, res.status);
  return data;
}

const sym = (s: string) => encodeURIComponent(s.toUpperCase());

export const api = {
  auth: {
    /** Accepts an email or a mobile number, like the backend. */
    login: (login: string, password: string) =>
      request<AuthResponse>("/api/login", "POST", login.includes("@") ? { email: login, password } : { mobile: login, password }, false),
    register: (data: { name: string; email: string; mobile: string; password: string }) =>
      request<AuthResponse & { message: string }>("/api/register", "POST", data, false),
  },
  me: {
    get: () => request<User>("/api/me"),
    update: (data: ProfileUpdate) => request<User>("/api/me", "PATCH", data),
    updateSettings: (data: Partial<UserSettings>) => request<UserSettings>("/api/me/settings", "PATCH", data),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ success: boolean }>("/api/me/password", "POST", { currentPassword, newPassword }),
    delete: (password: string) => request<{ success: boolean }>("/api/me", "DELETE", { password, confirm: "DELETE" }),
  },
  portfolio: {
    summary: () => request<PortfolioSummary>("/api/portfolio/cash-balance"),
    holdings: () => request<Holding[]>("/api/portfolio/holdings"),
    transactions: () => request<Trade[]>("/api/transactions"),
    reset: () => request<ResetResult>("/api/portfolio/reset", "POST", { confirm: "RESET" }),
    /** Server prices the order live; `price` is only a fallback when no quote is available. */
    trade: (symbol: string, type: "BUY" | "SELL", quantity: number, price?: number) =>
      request<TradeResult>("/api/store-purchase", "POST", { symbol, type, quantity, price }),
  },
  stocks: {
    curated: () => request<CuratedSector[]>("/api/stocks/curated", "GET", undefined, false),
    search: (q: string) => request<SearchResult[]>(`/api/stocks/search?q=${encodeURIComponent(q)}`, "GET", undefined, false),
    quotes: (symbols: string[]) =>
      request<Record<string, StockQuote>>(`/api/stocks/quotes?symbols=${symbols.map(sym).join(",")}`, "GET", undefined, false),
    quote: (s: string) => request<StockQuote>(`/api/stocks/${sym(s)}/quote`, "GET", undefined, false),
    profile: (s: string) => request<StockProfile>(`/api/stocks/${sym(s)}/profile`, "GET", undefined, false),
    metrics: (s: string) => request<StockMetrics>(`/api/stocks/${sym(s)}/metrics`, "GET", undefined, false),
    news: (s: string) => request<NewsItem[]>(`/api/stocks/${sym(s)}/news`, "GET", undefined, false),
    candles: (s: string, days = 365) => request<Candles>(`/api/stocks/${sym(s)}/candles?days=${days}`, "GET", undefined, false),
    /** Quotes for the 12 stocks that have their own page (one cached call). */
    popular: () => request<Record<string, RawQuote>>("/search", "GET", undefined, false),
  },
  ai: {
    analyze: (holdings: AdvisorHolding[], riskProfile: RiskProfile, question?: string) =>
      request<AnalysisResult>("/api/ai/analyze-portfolio", "POST", { holdings, risk_profile: riskProfile, question: question || undefined }),
    history: () => request<AnalysisSummary[]>("/api/ai/history"),
    analysis: (id: string) => request<AnalysisDetail>(`/api/ai/history/${encodeURIComponent(id)}`),
    deleteAnalysis: (id: string) => request<{ deleted: boolean }>(`/api/ai/history/${encodeURIComponent(id)}`, "DELETE"),
    memory: () => request<AIMemory>("/api/ai/memory"),
    rebuildMemory: () => request<AIMemory>("/api/ai/memory/rebuild", "POST"),
  },
  patterns: {
    list: (filter: { type?: PatternType; severity?: Severity; limit?: number } = {}) => {
      const qs = new URLSearchParams(Object.entries(filter).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])).toString();
      return request<{ patterns: Pattern[] }>(`/api/patterns${qs ? `?${qs}` : ""}`);
    },
    summary: () => request<PatternSummary>("/api/patterns/summary"),
    acknowledge: (id: string) => request<{ pattern: Pattern }>(`/api/patterns/${encodeURIComponent(id)}/acknowledge`, "PATCH"),
    acknowledgeAll: () => request<{ success: boolean }>("/api/patterns/acknowledge-all", "POST"),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/patterns/${encodeURIComponent(id)}`, "DELETE"),
    insight: () => request<BehaviorInsight | { insight: null }>("/api/patterns/insight"),
    analyze: () => request<BehaviorInsight>("/api/patterns/analyze", "POST"),
  },
  watchlist: {
    list: () => request<WatchlistItem[]>("/api/watchlist"),
    add: (symbol: string) => request<WatchlistItem>("/api/watchlist", "POST", { symbol }),
    remove: (symbol: string) => request<{ removed: boolean }>(`/api/watchlist/${sym(symbol)}`, "DELETE"),
  },
  contact: {
    send: (data: ContactMessage) => request<{ success: boolean; emailed: boolean }>("/api/contact", "POST", data, false),
  },
  status: () => request<SystemStatus>("/api/status", "GET", undefined, false),
};

// Market-data payloads for tests.
import type { Candles, CuratedSector, NewsItem, StockMetrics, StockProfile, StockQuote } from "../types";

export const QUOTE: StockQuote = { symbol: "XOM", price: 112.4, change: 1.2, changePercent: 1.08, open: 111, high: 113, low: 110.5, prevClose: 111.2, time: "2026-10-05T15:00:00Z" };
export const PROFILE: StockProfile = { symbol: "XOM", name: "Exxon Mobil Corp", logo: null, industry: "Energy", exchange: "NEW YORK STOCK EXCHANGE, INC.", country: "US", ipo: "1920-01-01", marketCap: 480000, website: "https://corporate.exxonmobil.com/" };
export const METRICS: StockMetrics = { symbol: "XOM", marketCap: 480000, peTTM: 14.2, epsTTM: 7.9, week52High: 126.3, week52Low: 97.8, beta: 0.9, dividendYield: 3.4, avgVolume10d: 15.2 };
export const NEWS: NewsItem[] = [{ headline: "Exxon beats estimates", source: "Reuters", url: "https://news.example/1", datetime: Math.floor(Date.now() / 1000) - 7200, summary: null }];
export const NO_CANDLES: Candles = { symbol: "XOM", available: false, reason: "not on current plan" };
export const CURATED: CuratedSector[] = [
  { category: "Big Tech", stocks: [{ symbol: "AAPL", name: "Apple" }, { symbol: "MSFT", name: "Microsoft" }] },
  { category: "Energy", stocks: [{ symbol: "XOM", name: "Exxon Mobil" }, { symbol: "CVX", name: "Chevron" }, { symbol: "COP", name: "ConocoPhillips" }] },
  { category: "ETFs", stocks: [{ symbol: "SPY", name: "SPDR S&P 500 ETF" }, { symbol: "QQQ", name: "Invesco QQQ" }] },
];

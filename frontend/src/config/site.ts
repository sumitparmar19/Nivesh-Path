// Site-wide constants: owner links (shown on About/Contact/footer; email stays private behind the contact
// form), and the 12 stocks that have local logos.
export const OWNER = {
  name: "Sumit Parmar",
  title: "MS Computer Science, University at Buffalo",
  github: "https://github.com/sumitparmar19",
  linkedin: "https://www.linkedin.com/in/sumit-parmar-07a544278",
} as const;

export interface FeaturedStock {
  symbol: string;
  name: string;
  logo: string;
}

export const FEATURED: FeaturedStock[] = [
  { symbol: "AAPL", name: "Apple", logo: "/img/Apple-Logo-PNG1.png" },
  { symbol: "NVDA", name: "NVIDIA", logo: "/img/nvidia.png" },
  { symbol: "TSLA", name: "Tesla", logo: "/img/icons8-tesla-48.png" },
  { symbol: "MSFT", name: "Microsoft", logo: "/img/microsoft-logo-png-2395.png" },
  { symbol: "AMZN", name: "Amazon", logo: "/img/1688364728amazon-icon-black.png" },
  { symbol: "WMT", name: "Walmart", logo: "/img/Walmart-Logo-PNG-Image.png" },
  { symbol: "NKE", name: "Nike", logo: "/img/pngimg.com%20-%20nike_PNG18.png" },
  { symbol: "UBER", name: "Uber", logo: "/img/1659777758uber-app-icon.png" },
  { symbol: "SBUX", name: "Starbucks", logo: "/img/Starbucks-Logo-PNG4.png" },
  { symbol: "NFLX", name: "Netflix", logo: "/img/pngimg.com%20-%20netflix_PNG10.png" },
  { symbol: "GS", name: "Goldman Sachs", logo: "/img/goldman-sachs-new-2022-seeklogo.svg" },
  { symbol: "ORCL", name: "Oracle", logo: "/img/image_processing20210620-25815-3aus89.png" },
];

const BY_SYMBOL = new Map(FEATURED.map((s) => [s.symbol, s]));
export const featured = (symbol: string): FeaturedStock | undefined => BY_SYMBOL.get(symbol.toUpperCase());
export const stockPath = (symbol: string): string => `/stock/${encodeURIComponent(symbol.toUpperCase())}`;

/** TradingView exchange prefix for the featured stocks (Walmart moved to NASDAQ in Dec 2025). */
export const EXCHANGE: Record<string, string> = {
  AAPL: "NASDAQ", NVDA: "NASDAQ", TSLA: "NASDAQ", MSFT: "NASDAQ", AMZN: "NASDAQ", WMT: "NASDAQ",
  NKE: "NYSE", UBER: "NYSE", SBUX: "NASDAQ", NFLX: "NASDAQ", GS: "NYSE", ORCL: "NYSE",
};

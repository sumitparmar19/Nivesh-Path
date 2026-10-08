// Release notes shown on What's new (newest first). Every shipped feature gets an entry here.
export interface Release {
  title: string;
  tag: string;
  isNew?: boolean;
  intro: string;
  points: [string, string][];
  links: { to: string; label: string }[];
}

export const RELEASES: Release[] = [
  {
    title: "Behavioral Mirror: see your own trading habits",
    tag: "Phase 2C · Oct 2026",
    isNew: true,
    intro: "Every trade is now checked for the habits that cost investors the most, using the price data at the moment you trade.",
    points: [
      ["Panic sells and FOMO buys.", "Selling after a sharp 5-day drop, or buying right under a 52-week high, is flagged, with the numbers that triggered it."],
      ["Overconcentration.", "A warning when one stock grows past 35% of your whole account (cash included), and again if it gets worse."],
      ["Your scores.", "Impulse control and diversification, computed from your own trades."],
      ["AI coach.", "A short explanation of your habits that cites your own trades, with one thing to try next time."],
    ],
    links: [{ to: "/behavioral-mirror", label: "Open Behavioral Mirror" }],
  },
  {
    title: "A faster app: rebuilt in React",
    tag: "Phase 2B · Oct 2026",
    intro: "Every page now runs in one fast React app: pages switch instantly, data refreshes in the background, and every stock has its own page at /stock/TICKER.",
    points: [
      ["One page for every stock.", "Open any NYSE or NASDAQ ticker at /stock/TICKER with live price, chart, key stats, profile and news."],
      ["Sortable portfolio.", "Sort holdings by value, P&L or weight; click any row to open the stock."],
      ["Export your trades.", "Filter transactions by type and date and download them as CSV."],
      ["Smarter AI history.", "Reopen or delete any past analysis; one-click questions to get started."],
    ],
    links: [{ to: "/markets", label: "Open Markets" }, { to: "/portfolio", label: "Portfolio" }],
  },
  {
    title: "50+ stocks, real stock data, and everything saved to your account",
    tag: "Audit sprints · Oct 2026",
    intro: "Every page does something real: more stocks, real company data, a watchlist, and settings that follow you to any device.",
    points: [
      ["50 stocks and ETFs, plus any US ticker.", "Browse by sector on Markets or search any NYSE/NASDAQ ticker and trade it."],
      ["Real stock data.", "Key stats (P/E, 52-week range, market cap), company profile and the latest news on every stock page."],
      ["Watchlist.", "Star any stock and follow it on your Watchlist page."],
      ["Your account, saved.", "Profile, theme and password are stored in your account; reset your paper money or delete your account any time."],
    ],
    links: [{ to: "/watchlist", label: "Watchlist" }, { to: "/account", label: "Account" }],
  },
  {
    title: "AI memory that survives every update",
    tag: "AI memory · Oct 2026",
    intro: "Your trades live in the database, and the advisor's memory of them is rebuilt automatically whenever the site is updated.",
    points: [
      ["Automatic rebuild.", "When the AI service starts, it re-reads every trade from MongoDB and re-indexes it in seconds."],
      ["Self-healing.", "If your memory is missing when you ask the advisor something, it is rebuilt on the spot."],
      ["See it and re-sync it.", "The AI memory panel on Portfolio shows how many trades the advisor can recall."],
    ],
    links: [{ to: "/portfolio", label: "See your AI memory" }],
  },
  {
    title: "Your own account with $100,000 of virtual cash",
    tag: "Phase 2A · Oct 2026",
    intro: "Every user has a private account and a cash balance that moves with each trade.",
    points: [
      ["Secure sign-in.", "Passwords are hashed and every request carries a signed token; you only ever see your own trades."],
      ["Safe orders.", "You can't spend more than you have or sell shares you don't own, even if you click twice."],
    ],
    links: [{ to: "/transactions", label: "Transactions" }],
  },
  {
    title: "AI Portfolio Advisor, powered by Claude",
    tag: "Phase 1 · Oct 2026",
    intro: "A plain-English read on your portfolio: risk, diversification, strengths, risks and next steps.",
    points: [
      ["Grounded in your history.", "The advisor looks up your most relevant past trades before answering."],
      ["Numbers you can trust.", "Profit, weights and concentration are calculated in code, never guessed by the AI."],
      ["Always answers.", "If the AI is unavailable, a rule-based analysis takes over."],
    ],
    links: [{ to: "/advisor", label: "Try the advisor" }],
  },
];

export const ROADMAP: [string, string, string][] = [
  ["2D", "Pre-trade check", "A quick gut-check before you buy or sell, plus portfolio stress tests."],
  ["2E", "News + AI chat", "Market news linked to your holdings and a chat that knows your portfolio."],
  ["2F", "Cloud + observability", "Email sign-in recovery, photo upload, monitoring and alerts."],
];

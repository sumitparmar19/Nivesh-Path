// Stock page: data display, unknown ticker, watch toggle, integer-only quantity, buying, logged-out view.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StockDetail from "../StockDetail";
import { mockApi, renderPage, signIn, signOut } from "../../test/utils";
import { SUMMARY, TRADES } from "../../test/fixtures";
import { CURATED, METRICS, NEWS, NO_CANDLES, PROFILE, QUOTE } from "../../test/stockFixtures";

const market = {
  "GET /api/stocks/XOM/quote": QUOTE,
  "GET /api/stocks/XOM/profile": PROFILE,
  "GET /api/stocks/XOM/metrics": METRICS,
  "GET /api/stocks/XOM/news": NEWS,
  "GET /api/stocks/XOM/candles": NO_CANDLES,
  "GET /api/stocks/curated": CURATED,
  "GET /api/stocks/quotes": { CVX: { ...QUOTE, symbol: "CVX", price: 150 } },
};
const account = { "GET /api/portfolio/cash-balance": SUMMARY, "GET /api/transactions": TRADES, "GET /api/watchlist": [] };
const open = () => renderPage(<StockDetail />, { path: "/stock/:symbol", route: "/stock/xom" });

describe("Stock detail", () => {
  beforeEach(() => signIn());

  it("shows the quote, key stats, profile, news, peers and the TradingView fallback chart", async () => {
    mockApi({ ...market, ...account });
    open();
    expect(await screen.findByTestId("stock-price")).toHaveTextContent("$112.40");
    expect(await screen.findByRole("heading", { name: /exxon mobil corp/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByText("14.2")).toBeInTheDocument();
    expect((await screen.findAllByText("$480.00B")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Exxon beats estimates")).toBeInTheDocument();
    expect(await screen.findByText("Chevron")).toBeInTheDocument();
    expect(await screen.findByTestId("tradingview-chart")).toBeInTheDocument();
  });

  it("shows a clear message for an unknown ticker", async () => {
    mockApi({ "GET /api/stocks/ZZZZ/quote": new Response(JSON.stringify({ error: "No price found for ZZZZ" }), { status: 404 }), ...account });
    renderPage(<StockDetail />, { path: "/stock/:symbol", route: "/stock/ZZZZ" });
    expect(await screen.findByText(/we don't have data for ZZZZ/i)).toBeInTheDocument();
  });

  it("the Watch button adds the stock to the watchlist", async () => {
    const { calls } = mockApi({ ...market, ...account, "POST /api/watchlist": { symbol: "XOM", addedAt: "2026-10-05" } });
    open();
    await userEvent.click(await screen.findByTestId("watch-XOM"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/watchlist")).toBe(true));
    expect(await screen.findByText("Watching")).toBeInTheDocument();
  });

  it("only accepts whole-share quantities and disables the button at 0", async () => {
    mockApi({ ...market, ...account });
    open();
    await screen.findByTestId("stock-price");
    const input = screen.getByTestId("quantity-input");
    expect(screen.getByRole("button", { name: /^buy xom$/i })).toBeDisabled();
    await userEvent.type(input, "2.5");
    expect(input).toHaveValue("25");
    await userEvent.clear(input);
    await userEvent.type(input, "3");
    expect(screen.getByTestId("order-total")).toHaveTextContent("$337.20");
  });

  it("places a buy order and shows the new cash balance", async () => {
    const { calls } = mockApi({
      ...market, ...account,
      "POST /api/store-purchase": { success: true, newBalance: 88862.8, transaction: { _id: "t9", name: "XOM", price: 112.4, quantity: 3, total: 337.2, transactionType: "buy", timestamp: "2026-10-05T15:00:00Z" } },
    });
    open();
    await screen.findByTestId("stock-price");
    await userEvent.type(screen.getByTestId("quantity-input"), "3");
    await userEvent.click(screen.getByRole("button", { name: /buy 3 xom/i }));
    expect(await screen.findByTestId("trade-success")).toHaveTextContent("Cash left: $88,862.80");
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ symbol: "XOM", type: "BUY", quantity: 3, price: 112.4 });
  });

  it("shows a Behavioral Mirror note when the server flags the trade", async () => {
    mockApi({
      ...market, ...account,
      "POST /api/store-purchase": {
        success: true, newBalance: 88862.8,
        transaction: { _id: "t9", name: "XOM", price: 112.4, quantity: 3, total: 337.2, transactionType: "buy", timestamp: "2026-10-05T15:00:00Z" },
        behavior: [{ _id: "b1", patternType: "fomo_buy", severity: "medium", symbol: "XOM", facts: { price: 112.4, week52High: 115, percentFromHigh: 2.26, fiveDayReturn: 4 } }],
      },
    });
    open();
    await screen.findByTestId("stock-price");
    await userEvent.type(screen.getByTestId("quantity-input"), "3");
    await userEvent.click(screen.getByRole("button", { name: /buy 3 xom/i }));
    expect(await screen.findByTestId("behavior-note")).toHaveTextContent("just 2.3% under its 52-week high of $115.00");
  });

  it("shows server errors like insufficient funds", async () => {
    mockApi({ ...market, ...account, "POST /api/store-purchase": new Response(JSON.stringify({ error: "Insufficient funds: this order costs $1,124,000.00 but you have $89,200.00." }), { status: 400 }) });
    open();
    await screen.findByTestId("stock-price");
    await userEvent.type(screen.getByTestId("quantity-input"), "10000");
    await userEvent.click(screen.getByRole("button", { name: /buy 10000 xom/i }));
    expect(await screen.findByTestId("trade-error")).toHaveTextContent(/insufficient funds/i);
  });

  it("logged-out visitors can browse but are asked to log in to trade", async () => {
    signOut();
    mockApi({ ...market });
    open();
    expect(await screen.findByTestId("stock-price")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login?redirect=%2Fstock%2FXOM");
    expect(screen.queryByTestId("quantity-input")).not.toBeInTheDocument();
  });
});

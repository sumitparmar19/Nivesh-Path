// Watchlist: rows with prices, remove, add via search, empty state.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Watchlist from "../Watchlist";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { QUOTE } from "../../test/stockFixtures";

const ITEMS = [{ symbol: "XOM", addedAt: "2026-10-01T00:00:00Z" }, { symbol: "TSLA", addedAt: "2026-10-02T00:00:00Z" }];
const open = () => renderPage(<Watchlist />, { path: "/watchlist", route: "/watchlist" });

describe("Watchlist", () => {
  beforeEach(() => signIn());

  it("renders watched stocks with live prices", async () => {
    mockApi({ "GET /api/watchlist": ITEMS, "GET /api/stocks/quotes": { XOM: QUOTE } });
    open();
    expect(await screen.findByTestId("watch-row-XOM")).toBeInTheDocument();
    expect(await screen.findByText("$112.40")).toBeInTheDocument();
    expect(screen.getByText("Tesla")).toBeInTheDocument();
  });

  it("removes a stock", async () => {
    const { calls } = mockApi({ "GET /api/watchlist": ITEMS, "GET /api/stocks/quotes": {}, "DELETE /api/watchlist/XOM": { removed: true } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: "Remove XOM" }));
    await waitFor(() => expect(screen.queryByTestId("watch-row-XOM")).not.toBeInTheDocument());
    expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/watchlist/XOM")).toBe(true);
  });

  it("adds a stock from the search box", async () => {
    const { calls } = mockApi({
      "GET /api/watchlist": [],
      "GET /api/stocks/search": [{ symbol: "AAPL", name: "APPLE INC", type: "Common Stock" }],
      "POST /api/watchlist": { symbol: "AAPL", addedAt: "2026-10-05T00:00:00Z" },
      "GET /api/stocks/quotes": {},
    });
    open();
    await userEvent.type(screen.getByTestId("search-input"), "apple");
    await userEvent.click(await screen.findByTestId("search-result-AAPL"));
    expect(await screen.findByTestId("watch-row-AAPL")).toBeInTheDocument();
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ symbol: "AAPL" });
  });

  it("shows the empty state", async () => {
    mockApi({ "GET /api/watchlist": [] });
    open();
    expect(await screen.findByText(/no stocks on your watchlist/i)).toBeInTheDocument();
  });

  it("each row links to the stock page", async () => {
    mockApi({ "GET /api/watchlist": ITEMS, "GET /api/stocks/quotes": {} });
    open();
    expect(await screen.findByRole("link", { name: /tesla/i })).toHaveAttribute("href", "/stock/TSLA");
  });
});

// Markets: search results + navigation, sector tabs, movers, watchlist stars, empty search.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Markets from "../Markets";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { CURATED, QUOTE } from "../../test/stockFixtures";

const POPULAR = { AAPL: { c: 250, d: 2, dp: 0.8 }, NVDA: { c: 120, d: 4, dp: 3.4 }, TSLA: { c: 200, d: -6, dp: -2.9 } };
const routes = {
  "GET /search": POPULAR,
  "GET /api/stocks/curated": CURATED,
  "GET /api/stocks/quotes": { SPY: { ...QUOTE, symbol: "SPY", price: 570 }, AAPL: { ...QUOTE, symbol: "AAPL", price: 250 }, XOM: QUOTE },
  "GET /api/stocks/search": [{ symbol: "XOM", name: "EXXON MOBIL CORP", type: "Common Stock" }],
  "GET /api/watchlist": [],
};
const open = () => renderPage(<Markets />, { path: "/markets", route: "/markets" });

describe("Markets", () => {
  beforeEach(() => signIn());

  it("searches as you type and opens the picked stock", async () => {
    mockApi(routes);
    const { router } = open();
    await userEvent.type(screen.getByTestId("search-input"), "xom");
    await userEvent.click(await screen.findByTestId("search-result-XOM"));
    expect(router.state.location.pathname).toBe("/stock/XOM");
  });

  it("Enter on a typed ticker opens it even before results arrive", async () => {
    mockApi({ ...routes, "GET /api/stocks/search": [] });
    const { router } = open();
    await userEvent.type(screen.getByTestId("search-input"), "brk.b{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/stock/BRK.B"));
  });

  it("switches sector tabs", async () => {
    mockApi(routes);
    open();
    const list = await screen.findByTestId("sector-list");
    await waitFor(() => expect(within(list).getByText("Apple")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("tab", { name: "Energy" }));
    expect(within(screen.getByTestId("sector-list")).getByText("Chevron")).toBeInTheDocument();
    expect(within(screen.getByTestId("sector-list")).queryByText("Apple")).not.toBeInTheDocument();
  });

  it("shows gainers and losers among the featured stocks", async () => {
    mockApi(routes);
    open();
    const gainers = (await screen.findByText("Top gainers today")).closest("section") as HTMLElement;
    await waitFor(() => expect(within(gainers).getAllByTestId(/^row-/)[0]).toHaveAttribute("data-testid", "row-NVDA"));
    const losers = screen.getByText("Top losers today").closest("section") as HTMLElement;
    expect(within(losers).getAllByTestId(/^row-/)[0]).toHaveAttribute("data-testid", "row-TSLA");
  });

  it("the star adds a stock to the watchlist without opening it", async () => {
    const { calls } = mockApi({ ...routes, "POST /api/watchlist": { symbol: "AAPL", addedAt: "2026-10-05" } });
    const { router } = open();
    await userEvent.click(await screen.findByTestId("watch-AAPL"));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/watchlist")).toBe(true));
    expect(router.state.location.pathname).toBe("/markets");
  });

  it("an empty search shows the placeholder and no results", async () => {
    mockApi(routes);
    open();
    expect(screen.getByPlaceholderText(/search by company or ticker/i)).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});

// Portfolio page: loading, totals, empty state, P&L colours, row navigation, sorting, recent activity.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Portfolio from "../Portfolio";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { EMPTY_SUMMARY, MEMORY, SUMMARY, TRADES } from "../../test/fixtures";

const base = { "GET /api/transactions": TRADES, "GET /api/ai/memory": MEMORY };

describe("Portfolio", () => {
  beforeEach(() => signIn());

  it("shows skeletons while loading, then the totals", async () => {
    mockApi({ ...base, "GET /api/portfolio/cash-balance": SUMMARY });
    renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    expect(screen.queryByTestId("cash-balance")).not.toBeInTheDocument();
    expect(await screen.findByTestId("cash-balance")).toHaveTextContent("$89,200.00");
    expect(screen.getByTestId("total-value")).toHaveTextContent("$100,500.00");
    expect(screen.getByText(/hi sumit/i)).toBeInTheDocument();
  });

  it("renders a row per holding with green/red P&L", async () => {
    mockApi({ ...base, "GET /api/portfolio/cash-balance": SUMMARY });
    renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    const nvda = await screen.findByTestId("holding-NVDA");
    const tsla = screen.getByTestId("holding-TSLA");
    expect(within(nvda).getByText("+$600.00")).toHaveClass("text-up");
    expect(within(tsla).getByText("-$300.00")).toHaveClass("text-down");
    expect(screen.getByTestId("total-pnl")).toHaveClass("text-up");
  });

  it("shows the welcome banner and empty state with no holdings", async () => {
    mockApi({ ...base, "GET /api/portfolio/cash-balance": EMPTY_SUMMARY, "GET /api/transactions": [] });
    renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    expect(await screen.findByText(/welcome! you have \$100,000.00/i)).toBeInTheDocument();
    expect(screen.getByText(/browse markets to buy your first stock/i)).toBeInTheDocument();
  });

  it("opens the stock page when a holding row is clicked", async () => {
    mockApi({ ...base, "GET /api/portfolio/cash-balance": SUMMARY });
    const { router } = renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    await userEvent.click(await screen.findByTestId("holding-TSLA"));
    expect(router.state.location.pathname).toBe("/stock/TSLA");
  });

  it("sorts holdings by a column and lists recent trades newest first", async () => {
    mockApi({ ...base, "GET /api/portfolio/cash-balance": SUMMARY });
    renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    await screen.findByTestId("holding-NVDA");
    const order = () => screen.getAllByTestId(/^holding-/).map((r) => r.getAttribute("data-testid"));
    expect(order()).toEqual(["holding-TSLA", "holding-NVDA"]); // by value, desc
    await userEvent.click(screen.getByRole("button", { name: /^stock/i }));
    expect(order()).toEqual(["holding-NVDA", "holding-TSLA"]); // by symbol, asc
    await waitFor(() => expect(screen.getAllByText(/^5 TSLA$|^30 TSLA$|^40 NVDA$/)[0]).toHaveTextContent("5 TSLA"));
  });

  it("shows an error with retry when the summary fails", async () => {
    mockApi({ ...base });
    renderPage(<Portfolio />, { path: "/portfolio", route: "/portfolio" });
    expect(await screen.findByText(/couldn't load your portfolio/i)).toBeInTheDocument();
  });
});

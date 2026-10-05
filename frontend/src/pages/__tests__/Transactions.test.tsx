// Transactions page: list, Buy/Sell filters, symbol search, CSV export, pagination and empty state.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import Transactions from "../Transactions";
import { tradesToCsv } from "../../lib/csv";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { SUMMARY, TRADES } from "../../test/fixtures";
import type { Trade } from "../../types";

const go = (trades: Trade[] = TRADES) => {
  mockApi({ "GET /api/transactions": trades, "GET /api/portfolio/cash-balance": SUMMARY });
  return renderPage(<Transactions />, { path: "/transactions", route: "/transactions" });
};

describe("Transactions", () => {
  beforeEach(() => signIn());

  it("renders every trade, newest first, with links to the stock", async () => {
    go();
    const rows = await screen.findAllByTestId("trade-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole("link", { name: "TSLA" })).toHaveAttribute("href", "/stock/TSLA");
    expect(within(rows[0]).getByText("Sell")).toBeInTheDocument();
  });

  it("filters to buys and to sells", async () => {
    go();
    await screen.findAllByTestId("trade-row");
    await userEvent.click(screen.getByRole("tab", { name: "Buys" }));
    expect(screen.getAllByTestId("trade-row")).toHaveLength(2);
    await userEvent.click(screen.getByRole("tab", { name: "Sells" }));
    expect(screen.getAllByTestId("trade-row")).toHaveLength(1);
  });

  it("searches by symbol and shows a no-match message", async () => {
    go();
    await screen.findAllByTestId("trade-row");
    await userEvent.type(screen.getByPlaceholderText(/search symbol/i), "nvd");
    expect(screen.getAllByTestId("trade-row")).toHaveLength(1);
    await userEvent.clear(screen.getByPlaceholderText(/search symbol/i));
    await userEvent.type(screen.getByPlaceholderText(/search symbol/i), "zzz");
    expect(screen.getByText(/no matching trades/i)).toBeInTheDocument();
  });

  it("exports the filtered trades as CSV", async () => {
    const createUrl = vi.fn(() => "blob:x");
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    go();
    await screen.findAllByTestId("trade-row");
    await userEvent.click(screen.getByRole("button", { name: /export csv/i }));
    expect(createUrl).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    const csv = tradesToCsv(TRADES);
    expect(csv.split("\n")[0]).toBe("Date,Type,Symbol,Quantity,Price,Total");
    expect(csv).toContain("SELL,TSLA,5,230.00,1150.00");
  });

  it("paginates 25 per page", async () => {
    const many: Trade[] = Array.from({ length: 30 }, (_, i) => ({ ...TRADES[0], _id: `m${i}`, timestamp: new Date(2026, 0, i + 1).toISOString() }));
    go(many);
    expect(await screen.findAllByTestId("trade-row")).toHaveLength(25);
    await userEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(screen.getAllByTestId("trade-row")).toHaveLength(5);
  });

  it("shows the empty state for a new account", async () => {
    go([]);
    expect(await screen.findByText(/no trades yet/i)).toBeInTheDocument();
  });
});

// Unit tests for the API client (auth header, 401 handling, error messages), session and formatting.
import { api, ApiError } from "../api";
import { tradesToCsv } from "../csv";
import { bigMoney, initials, money, pct, signedMoney } from "../format";
import { safeRedirect } from "../redirect";
import { readToken, saveSession } from "../session";
import { errorResponse, fakeToken, mockApi } from "../../test/utils";

describe("api client", () => {
  it("sends the JWT and the backend's field names", async () => {
    const token = fakeToken();
    localStorage.setItem("token", token);
    const { fetchMock, calls } = mockApi({ "POST /api/portfolio/reset": { success: true, cashBalance: 100000, tradesRemoved: 0 } });
    await api.portfolio.reset();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${token}`);
    expect(calls[0].body).toEqual({ confirm: "RESET" });
  });

  it("turns error bodies into ApiError messages", async () => {
    mockApi({ "GET /api/watchlist": errorResponse(400, "Invalid stock symbol") });
    await expect(api.watchlist.list()).rejects.toEqual(new ApiError("Invalid stock symbol", 400));
  });

  it("clears the session on 401", async () => {
    localStorage.setItem("token", fakeToken());
    const assign = vi.fn();
    Object.defineProperty(window, "location", { value: { ...window.location, assign, pathname: "/portfolio", search: "" }, writable: true });
    mockApi({ "GET /api/me": errorResponse(401, "Invalid or expired token") });
    await expect(api.me.get()).rejects.toMatchObject({ status: 401 });
    expect(localStorage.getItem("token")).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login?redirect=%2Fportfolio");
  });
});

describe("session + helpers", () => {
  it("drops expired tokens and stores the legacy-compatible session", () => {
    localStorage.setItem("token", `x.${btoa(JSON.stringify({ exp: 1 }))}.y`);
    expect(readToken()).toBeNull();
    saveSession(fakeToken(), { id: "u", name: "A B", email: "a@b.co", mobile: "1", nickname: "", country: "", city: "", address: "", cashBalance: 1, settings: { theme: "dark", language: "English", notifications: true } });
    expect(JSON.parse(localStorage.getItem("niveshPathUser") || "{}").name).toBe("A B");
    expect(localStorage.getItem("niveshPathTheme")).toBe("dark");
  });

  it("formats money, signs, percentages, market cap and initials", () => {
    expect(money(1234.5)).toBe("$1,234.50");
    expect(signedMoney(-300)).toBe("-$300.00");
    expect(pct(1.5)).toBe("+1.50%");
    expect(bigMoney(3500000)).toBe("$3.50T");
    expect(initials("Sumit Parmar")).toBe("SP");
  });

  it("only allows same-site redirects and writes valid CSV", () => {
    expect(safeRedirect("//evil.com")).toBe("/portfolio");
    expect(safeRedirect("/stock/TSLA")).toBe("/stock/TSLA");
    expect(tradesToCsv([{ _id: "1", name: "AAPL", price: 1, quantity: 2, total: 2, transactionType: "buy", timestamp: "2026-01-01T00:00:00Z" }])).toBe(
      "Date,Type,Symbol,Quantity,Price,Total\n2026-01-01T00:00:00.000Z,BUY,AAPL,2,1.00,2.00\n",
    );
  });
});

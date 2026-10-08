// Behavioral Mirror page: scores, empty state, filters, read/dismiss actions and the AI coach.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BehavioralMirror from "../BehavioralMirror";
import { errorResponse, mockApi, renderPage, signIn } from "../../test/utils";
import { CONC, EMPTY_SUMMARY, FOMO, INSIGHT, PANIC, SUMMARY } from "../../test/patternFixtures";

const open = () => renderPage(<BehavioralMirror />, { path: "/behavioral-mirror", route: "/behavioral-mirror" });
const BASE = {
  "GET /api/patterns/summary": SUMMARY,
  "GET /api/patterns": { patterns: [PANIC, FOMO, CONC] },
  "GET /api/patterns/insight": { insight: null },
};

describe("Behavioral Mirror", () => {
  beforeEach(() => signIn());

  it("shows loading placeholders, then the scores and counts", async () => {
    mockApi(BASE);
    open();
    expect(screen.getByRole("heading", { name: "Behavioral Mirror" })).toBeInTheDocument();
    expect(await screen.findByTestId("score-Impulse control")).toHaveTextContent("60");
    expect(screen.getByRole("meter", { name: "Diversification" })).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText(/3 of your 5 trades had no panic or FOMO flag/)).toBeInTheDocument();
    expect(screen.getByTestId("count-panic_sell")).toHaveTextContent("1");
  });

  it("a new user sees the empty state and no impulse score yet", async () => {
    mockApi({ ...BASE, "GET /api/patterns/summary": EMPTY_SUMMARY, "GET /api/patterns": { patterns: [] } });
    open();
    expect(await screen.findByText("No patterns detected")).toBeInTheDocument();
    expect(screen.getByText("Needs at least 3 trades (you have 0).")).toBeInTheDocument();
    expect(screen.getByText(/your account is all cash/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /get my insight/i })).not.toBeInTheDocument();
  });

  it("filter tabs show only matching patterns", async () => {
    mockApi(BASE);
    open();
    await screen.findByTestId("pattern-panic_sell");
    const tabs = screen.getByRole("tablist", { name: "Filter patterns" });
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["All (3)", "Panic sell (1)", "FOMO buy (1)", "Overconcentration (1)"]);
    await userEvent.click(within(tabs).getByRole("tab", { name: "FOMO buy (1)" }));
    expect(screen.getByTestId("pattern-fomo_buy")).toBeInTheDocument();
    expect(screen.queryByTestId("pattern-panic_sell")).not.toBeInTheDocument();
  });

  it("Got it and Dismiss call the API", async () => {
    const { calls } = mockApi({ ...BASE, "PATCH /api/patterns/p1/acknowledge": { pattern: { ...PANIC, acknowledged: true } }, "DELETE /api/patterns/p3": { deleted: true } });
    open();
    await userEvent.click(within(await screen.findByTestId("pattern-panic_sell")).getByRole("button", { name: /got it/i }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss Overconcentration on AAPL" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/patterns/p3")).toBe(true));
    expect(calls.some((c) => c.method === "PATCH" && c.url === "/api/patterns/p1/acknowledge")).toBe(true);
    expect(await screen.findByText("Pattern dismissed.")).toBeInTheDocument();
  });

  it("Mark all read calls the API", async () => {
    const { calls } = mockApi({ ...BASE, "POST /api/patterns/acknowledge-all": { success: true } });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /mark all read/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/api/patterns/acknowledge-all")).toBe(true));
  });

  it("Get my insight asks the AI coach and shows the answer", async () => {
    const { calls } = mockApi({ ...BASE, "POST /api/patterns/analyze": INSIGHT });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /get my insight/i }));
    const box = await screen.findByTestId("coach-insight");
    expect(box).toHaveTextContent(INSIGHT.headline);
    expect(box).toHaveTextContent("Try this: Wait a day before selling after a drop.");
    expect(within(box).getByText("AI insight")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/patterns/analyze")).toBe(true);
  });

  it("shows the last saved insight without calling the AI again", async () => {
    const { calls } = mockApi({ ...BASE, "GET /api/patterns/insight": { ...INSIGHT, ai_generated: false } });
    open();
    expect(await screen.findByTestId("coach-insight")).toHaveTextContent("Rule-based insight");
    expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/patterns/analyze")).toBe(false);
  });

  it("an AI outage shows a readable error with retry", async () => {
    mockApi({ ...BASE, "POST /api/patterns/analyze": errorResponse(503, "The AI coach is unavailable right now. Please try again in a minute.") });
    open();
    await userEvent.click(await screen.findByRole("button", { name: /get my insight/i }));
    expect(await screen.findByText(/AI coach is unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("a server error on the summary shows an error state", async () => {
    mockApi({ ...BASE, "GET /api/patterns/summary": errorResponse(500, "Internal server error") });
    open();
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});

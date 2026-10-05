// AI Advisor: holdings pre-load, chip questions, validation, results, history open and delete.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Advisor from "../Advisor";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { MEMORY } from "../../test/fixtures";
import { DETAIL, HISTORY, RESULT } from "../../test/aiFixtures";

const HOLDINGS = [{ symbol: "NVDA", quantity: 40, avg_price: 110 }, { symbol: "TSLA", quantity: 30, avg_price: 220 }];
const base = { "GET /api/portfolio/holdings": HOLDINGS, "GET /api/ai/history": HISTORY, "GET /api/ai/memory": MEMORY };

describe("AI Advisor", () => {
  beforeEach(() => signIn());

  it("pre-loads the user's holdings and memory status", async () => {
    mockApi(base);
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    await waitFor(() => expect(screen.getAllByLabelText("Symbol").map((i) => (i as HTMLInputElement).value)).toEqual(["NVDA", "TSLA"]));
    expect(await screen.findByText(/remembers 3 of your 3 trades/i)).toBeInTheDocument();
  });

  it("a chip question fills the question, sends it with the risk profile and shows the result", async () => {
    const { calls } = mockApi({ ...base, "POST /api/ai/analyze-portfolio": RESULT });
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    await screen.findAllByLabelText("Symbol");
    await userEvent.selectOptions(screen.getByLabelText(/risk profile/i), "aggressive");
    await userEvent.click(screen.getByRole("button", { name: "Am I too concentrated?" }));
    expect(await screen.findByTestId("ai-result")).toHaveTextContent("Concentrated in two tech names.");
    expect(screen.getByLabelText(/ask a question/i)).toHaveValue("Am I too concentrated?");
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body).toEqual({ holdings: HOLDINGS, risk_profile: "aggressive", question: "Am I too concentrated?" });
    expect(screen.getByText(/looked up these 1 past trades/i)).toBeInTheDocument();
  });

  it("disables Analyze when there are no valid holdings", async () => {
    mockApi({ ...base, "GET /api/portfolio/holdings": [] });
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    expect(await screen.findByText(/you don't own any stocks yet/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze my portfolio/i })).toBeDisabled();
  });

  it("lists past analyses and opens one", async () => {
    mockApi({ ...base, "GET /api/ai/history/a1": DETAIL });
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    const list = await screen.findByRole("list", { name: /past analyses/i });
    await userEvent.click(within(list).getByRole("button", { name: /should i rebalance/i }));
    expect(await screen.findByTestId("ai-result")).toHaveTextContent("Older summary");
    expect(screen.getByLabelText(/risk profile/i)).toHaveValue("conservative");
  });

  it("deletes an analysis from the history", async () => {
    const { calls } = mockApi({ ...base, "DELETE /api/ai/history/a1": { deleted: true } });
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    await userEvent.click(await screen.findByRole("button", { name: /delete analysis/i }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/api/ai/history/a1")).toBe(true));
    expect(await screen.findByText(/analysis deleted/i)).toBeInTheDocument();
  });

  it("shows the API error when analysis fails", async () => {
    mockApi({ ...base, "POST /api/ai/analyze-portfolio": new Response(JSON.stringify({ error: "AI service returned 502" }), { status: 502 }) });
    renderPage(<Advisor />, { path: "/advisor", route: "/advisor" });
    await screen.findAllByLabelText("Symbol");
    await userEvent.click(screen.getByRole("button", { name: /analyze my portfolio/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("AI service returned 502");
  });
});

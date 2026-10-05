// What's new: status rows from /api/status, degraded/unreachable states, releases and roadmap.
import { screen, within } from "@testing-library/react";
import WhatsNew from "../WhatsNew";
import { mockApi, renderPage } from "../../test/utils";
import { RELEASES } from "../../config/releases";

const OK = { web: "ok", db: "connected", ai: { reachable: true, llmConfigured: true, model: "claude-opus-5-5", vectorIndex: { status: "ok", users: 3, transactions: 42, seconds: 1.8 } }, checkedAt: "2026-10-05T10:00:00Z" };
const open = () => renderPage(<WhatsNew />, { path: "/whats-new", route: "/whats-new" });

describe("What's new", () => {
  it("shows every service as healthy", async () => {
    mockApi({ "GET /api/status": OK });
    open();
    expect(await screen.findByText("All systems go")).toBeInTheDocument();
    const list = screen.getByTestId("status-list");
    expect(within(list).getByText("claude-opus-5-5")).toBeInTheDocument();
    expect(within(list).getByText(/42 trades for 3 users/)).toBeInTheDocument();
  });

  it("flags a disconnected database as degraded", async () => {
    mockApi({ "GET /api/status": { ...OK, db: "disconnected" } });
    open();
    expect(await screen.findByText("Partly degraded")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
  });

  it("says when the status service is unreachable", async () => {
    mockApi({});
    open();
    expect(await screen.findByText("Unreachable")).toBeInTheDocument();
  });

  it("lists every release newest first with try-it links", () => {
    mockApi({ "GET /api/status": OK });
    open();
    const titles = screen.getAllByRole("article").map((a) => a.querySelector("h2")?.textContent);
    expect(titles.slice(0, RELEASES.length)).toEqual(RELEASES.map((r) => r.title));
    expect(screen.getByRole("link", { name: "Open Markets" })).toHaveAttribute("href", "/markets");
  });

  it("shows the roadmap", () => {
    mockApi({ "GET /api/status": OK });
    open();
    expect(screen.getByText("Behavioral Mirror")).toBeInTheDocument();
  });
});

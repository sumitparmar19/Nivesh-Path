// Advisor result view (Phase 2C follow-up A1/A2): weights are shares of the whole account, the invested-money
// share is labelled as such, cash is shown, and Diversification is the code-computed score.
import { render, screen } from "@testing-library/react";
import InsightView from "../InsightView";
import { RESULT } from "../../test/aiFixtures";
import type { AnalysisResult } from "../../types";

// The live-test account: $78,298.38 cash; INTC is 9.53% of the account but 43.91% of invested money.
const LIVE: AnalysisResult = {
  ...RESULT,
  metrics: {
    total_value: 21701.62, cash: 78298.38, account_value: 100000, cash_pct: 78.3, total_cost: 21701.62,
    total_unrealized_pl: 0, total_unrealized_pl_pct: 0, position_count: 3, largest_position: "INTC", largest_weight_pct: 9.53,
    concentration_hhi: 189.4, concentration_level: "none", diversification_score: 90,
    positions: [{ symbol: "INTC", market_value: 9530.12, cost_basis: 9530.12, unrealized_pl: 0, unrealized_pl_pct: 0, weight_pct: 9.53, invested_weight_pct: 43.91 }],
  },
  insight: { ...RESULT.insight, diversification_score: 90 },
};

describe("InsightView", () => {
  it("shows the largest position as a share of the account, with the invested share labelled", () => {
    render(<InsightView data={LIVE} />);
    expect(screen.getByText("INTC · 9.5%")).toBeInTheDocument();
    expect(screen.getByText("of your account (43.9% of invested money)")).toBeInTheDocument();
  });

  it("shows the account value and the cash share", () => {
    render(<InsightView data={LIVE} />);
    expect(screen.getByText("$100,000.00")).toBeInTheDocument();
    expect(screen.getByText("Cash $78,298.38 (78.3%)")).toBeInTheDocument();
  });

  it("shows the code-computed Diversification score", () => {
    render(<InsightView data={LIVE} />);
    expect(screen.getByText("90/100")).toBeInTheDocument();
  });

  it("older saved analyses without cash still render, labelled as invested money", () => {
    render(<InsightView data={RESULT} />);
    expect(screen.getByText("Invested value")).toBeInTheDocument();
    expect(screen.getByText("of invested money")).toBeInTheDocument();
  });

  it("explains that history is listed oldest first", () => {
    render(<InsightView data={LIVE} />);
    expect(screen.getByText(/past trades of yours before answering \(oldest first\)/)).toBeInTheDocument();
  });
});

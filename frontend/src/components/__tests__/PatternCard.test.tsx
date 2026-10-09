// PatternCard + BehaviorNote: labels, explanations built from server facts, read state and actions.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { BehaviorNote, PatternCard, explain } from "../PatternCard";
import { CONC, FOMO, PANIC } from "../../test/patternFixtures";
import type { Pattern } from "../../types";

const card = (p: Pattern, onAcknowledge = vi.fn(), onDismiss = vi.fn()) => {
  render(<MemoryRouter><PatternCard pattern={p} onAcknowledge={onAcknowledge} onDismiss={onDismiss} /></MemoryRouter>);
  return { onAcknowledge, onDismiss };
};

describe("PatternCard", () => {
  it("explains a panic sell with the drop and the loss vs average cost", () => {
    card(PANIC);
    expect(screen.getByRole("heading", { name: "Panic sell" })).toBeInTheDocument();
    expect(screen.getByText("medium severity")).toBeInTheDocument();
    expect(screen.getByText(/sold TSLA at \$180.50 after it fell 12.4% in 5 days\. That was 9.8% below what you paid/)).toBeInTheDocument();
  });

  it("explains a FOMO buy with the distance from the 52-week high and the run-up", () => {
    expect(explain("fomo_buy", "NVDA", FOMO.facts)).toBe("You bought NVDA at $140.00, just 0.7% under its 52-week high of $141.00 after a 16.2% 5-day run-up.");
  });

  it("explains overconcentration as a share of the whole account", () => {
    card(CONC);
    expect(screen.getByText("AAPL was 40.0% of your whole account ($40,000.00 of $100,000.00).")).toBeInTheDocument();
  });

  it("unread cards offer Got it and call onAcknowledge", async () => {
    const { onAcknowledge } = card(PANIC);
    await userEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(onAcknowledge).toHaveBeenCalledWith("p1");
  });

  it("read cards hide Got it and look dimmed", () => {
    card(FOMO);
    expect(screen.queryByRole("button", { name: /got it/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("pattern-fomo_buy")).toHaveClass("opacity-70");
  });

  it("Dismiss calls onDismiss with the pattern id", async () => {
    const { onDismiss } = card(CONC);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss Overconcentration on AAPL" }));
    expect(onDismiss).toHaveBeenCalledWith("p3");
  });

  it("links the symbol to its stock page", () => {
    card(PANIC);
    expect(screen.getByRole("link", { name: "TSLA" })).toHaveAttribute("href", "/stock/TSLA");
  });
});

describe("BehaviorNote (trade panel)", () => {
  it("renders nothing when the trade was not flagged", () => {
    const { container } = render(<MemoryRouter><BehaviorNote items={[]} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains a flagged trade and links to the Behavioral Mirror", () => {
    render(<MemoryRouter><BehaviorNote items={[FOMO]} /></MemoryRouter>);
    expect(screen.getByTestId("behavior-note")).toHaveTextContent("Behavioral Mirror: fomo buy.");
    expect(screen.getByRole("link", { name: /see your trading habits/i })).toHaveAttribute("href", "/behavioral-mirror");
  });
});

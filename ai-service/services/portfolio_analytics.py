"""Deterministic portfolio math (P/L, weights, concentration) plus a rule-based fallback insight.

The LLM is never asked to do arithmetic: these numbers are computed here and handed to it.
"""

from __future__ import annotations

import math

from schemas import AIInsight, Holding, PortfolioMetrics, PositionMetrics, Recommendation


CONCENTRATION_BANDS: tuple[tuple[float, str], ...] = ((65, "high"), (50, "medium"), (35, "low"))


def diversification_score(largest_account_pct: float) -> int:
    """100 - the largest stock's share of the whole account. Same formula as the Behavioral Mirror (Node
    `behaviorRules.diversification`), so both pages always show the same number."""
    # floor(x + 0.5) rounds halves up like JavaScript's Math.round (Python's round() rounds 86.5 to 86).
    return max(0, min(100, math.floor(100 - largest_account_pct + 0.5)))


def concentration_level(largest_account_pct: float) -> str:
    """Largest stock over 35% / 50% / 65% of the account -> low / medium / high (as in the Behavioral Mirror)."""
    for limit, level in CONCENTRATION_BANDS:
        if largest_account_pct > limit:
            return level
    return "none"


def compute_metrics(holdings: list[Holding], cash: float | None = None) -> PortfolioMetrics:
    """Aggregate holdings (merging duplicate symbols) into portfolio-level metrics.

    Weights are shares of the whole account (cash + holdings) when `cash` is given, like the Portfolio page;
    `invested_weight_pct` keeps the share of invested money only. Without cash, both are the same.
    """
    merged: dict[str, tuple[float, float, float]] = {}
    for h in holdings:
        symbol = h.symbol.upper()
        price = h.current_price or h.avg_price
        qty, cost, value = merged.get(symbol, (0.0, 0.0, 0.0))
        merged[symbol] = (qty + h.quantity, cost + h.quantity * h.avg_price, value + h.quantity * price)

    total_value = sum(v for _, _, v in merged.values())
    total_cost = sum(c for _, c, _ in merged.values())
    cash_value = max(0.0, cash or 0.0)
    account_value = total_value + cash_value

    def share(value: float, of: float) -> float:
        return round(value / of * 100, 2) if of else 0.0

    positions: list[PositionMetrics] = []
    for symbol, (_, cost, value) in merged.items():
        pl = value - cost
        positions.append(
            PositionMetrics(
                symbol=symbol,
                market_value=round(value, 2),
                cost_basis=round(cost, 2),
                unrealized_pl=round(pl, 2),
                unrealized_pl_pct=round(pl / cost * 100, 2) if cost else 0.0,
                weight_pct=share(value, account_value),
                invested_weight_pct=share(value, total_value),
            )
        )
    positions.sort(key=lambda p: p.market_value, reverse=True)

    hhi = sum(p.weight_pct**2 for p in positions)
    total_pl = total_value - total_cost
    largest = positions[0].weight_pct
    return PortfolioMetrics(
        total_value=round(total_value, 2),
        cash=round(cash_value, 2),
        account_value=round(account_value, 2),
        cash_pct=share(cash_value, account_value),
        total_cost=round(total_cost, 2),
        total_unrealized_pl=round(total_pl, 2),
        total_unrealized_pl_pct=round(total_pl / total_cost * 100, 2) if total_cost else 0.0,
        position_count=len(positions),
        largest_position=positions[0].symbol,
        largest_weight_pct=largest,
        concentration_hhi=round(hhi, 1),
        concentration_level=concentration_level(largest),
        diversification_score=diversification_score(largest),
        positions=positions,
    )


def rule_based_insight(metrics: PortfolioMetrics) -> AIInsight:
    """Heuristic insight used when Claude is unavailable (no API key, outage, refusal)."""
    level = metrics.concentration_level
    if level == "high" or (metrics.position_count == 1 and metrics.cash_pct < 50):
        risk = "high"
    elif level in ("medium", "low"):
        risk = "medium"
    else:
        risk = "low"

    strengths: list[str] = []
    risks: list[str] = []
    recs: list[Recommendation] = []

    if metrics.total_unrealized_pl > 0:
        strengths.append(f"Portfolio is up {metrics.total_unrealized_pl_pct}% overall.")
    elif metrics.total_unrealized_pl < 0:
        risks.append(f"Portfolio is down {abs(metrics.total_unrealized_pl_pct)}% overall.")
    if metrics.position_count >= 5:
        strengths.append(f"Holds {metrics.position_count} distinct positions.")
    if metrics.cash_pct >= 50:
        strengths.append(f"{metrics.cash_pct}% of the account is in cash, which limits how much any one stock can hurt.")
    if level != "none":
        risks.append(f"{metrics.largest_position} is {metrics.largest_weight_pct}% of the whole account.")
        recs.append(
            Recommendation(
                action="rebalance",
                symbol=metrics.largest_position,
                rationale="One stock above 35% of the whole account concentrates risk; consider trimming.",
            )
        )
    for p in metrics.positions:
        if p.unrealized_pl_pct <= -20:
            recs.append(
                Recommendation(
                    action="research",
                    symbol=p.symbol,
                    rationale=f"Down {abs(p.unrealized_pl_pct)}%; re-check the investment thesis.",
                )
            )
    if not recs:
        recs.append(Recommendation(action="hold", rationale="No rule-based red flags detected."))

    return AIInsight(
        summary=(
            f"{metrics.position_count} positions worth ${metrics.total_value:,.2f} "
            f"({metrics.total_unrealized_pl_pct:+.2f}% unrealized), plus ${metrics.cash:,.2f} in cash. Risk looks {risk}."
        ),
        risk_level=risk,
        diversification_score=metrics.diversification_score,
        strengths=strengths or ["Portfolio data received."],
        risks=risks or ["No major rule-based risks detected."],
        recommendations=recs,
    )

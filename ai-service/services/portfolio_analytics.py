"""Deterministic portfolio math (P/L, weights, concentration) plus a rule-based fallback insight.

The LLM is never asked to do arithmetic: these numbers are computed here and handed to it.
"""

from __future__ import annotations

from schemas import AIInsight, Holding, PortfolioMetrics, PositionMetrics, Recommendation


def compute_metrics(holdings: list[Holding]) -> PortfolioMetrics:
    """Aggregate holdings (merging duplicate symbols) into portfolio-level metrics."""
    merged: dict[str, tuple[float, float, float]] = {}
    for h in holdings:
        symbol = h.symbol.upper()
        price = h.current_price or h.avg_price
        qty, cost, value = merged.get(symbol, (0.0, 0.0, 0.0))
        merged[symbol] = (qty + h.quantity, cost + h.quantity * h.avg_price, value + h.quantity * price)

    total_value = sum(v for _, _, v in merged.values())
    total_cost = sum(c for _, c, _ in merged.values())

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
                weight_pct=round(value / total_value * 100, 2) if total_value else 0.0,
            )
        )
    positions.sort(key=lambda p: p.market_value, reverse=True)

    hhi = sum((p.market_value / total_value * 100) ** 2 for p in positions) if total_value else 0.0
    total_pl = total_value - total_cost
    return PortfolioMetrics(
        total_value=round(total_value, 2),
        total_cost=round(total_cost, 2),
        total_unrealized_pl=round(total_pl, 2),
        total_unrealized_pl_pct=round(total_pl / total_cost * 100, 2) if total_cost else 0.0,
        position_count=len(positions),
        largest_position=positions[0].symbol,
        largest_weight_pct=positions[0].weight_pct,
        concentration_hhi=round(hhi, 1),
        positions=positions,
    )


def rule_based_insight(metrics: PortfolioMetrics) -> AIInsight:
    """Heuristic insight used when Claude is unavailable (no API key, outage, refusal)."""
    diversification = max(0, min(100, round(100 - metrics.concentration_hhi / 100)))
    if metrics.concentration_hhi > 5000 or metrics.position_count == 1:
        risk = "high"
    elif metrics.concentration_hhi > 2500:
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
    if metrics.largest_weight_pct > 40:
        risks.append(f"{metrics.largest_position} is {metrics.largest_weight_pct}% of the portfolio.")
        recs.append(
            Recommendation(
                action="rebalance",
                symbol=metrics.largest_position,
                rationale="Single-name weight above 40% concentrates risk; consider trimming.",
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
            f"({metrics.total_unrealized_pl_pct:+.2f}% unrealized). Risk looks {risk}."
        ),
        risk_level=risk,
        diversification_score=diversification,
        strengths=strengths or ["Portfolio data received."],
        risks=risks or ["No major rule-based risks detected."],
        recommendations=recs,
    )

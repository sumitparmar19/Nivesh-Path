"""Behavioral Mirror coaching: the prompt facts for Claude and a rule-based fallback.

All numbers arrive pre-computed from the Node detectors; this module only turns them into words, so the
fallback and the prompt can never disagree with the figures shown on the page.
"""

from __future__ import annotations

from schemas import BehaviorCoaching, BehaviorEvent, BehaviorRequest

LABELS = {"panic_sell": "panic sell", "fomo_buy": "FOMO buy", "overconcentration": "overconcentration"}


def describe_event(event: BehaviorEvent) -> str:
    """One plain-English line per event, using only the stored facts."""
    f = event.facts
    when = f" on {event.created_at[:10]}" if event.created_at else ""
    if event.pattern_type == "panic_sell":
        line = f"Sold {event.symbol} at ${f.get('price')} after a {f.get('fiveDayReturn')}% 5-day move"
        if f.get("vsCostPct") is not None:
            line += f" ({f.get('vsCostPct')}% vs your average cost)"
    elif event.pattern_type == "fomo_buy":
        line = f"Bought {event.symbol} at ${f.get('price')}, {f.get('percentFromHigh')}% under its 52-week high"
        if f.get("fiveDayReturn") is not None:
            line += f" after a {f.get('fiveDayReturn')}% 5-day run-up"
    else:
        line = f"{event.symbol} reached {f.get('percentOfAccount')}% of your whole account"
    return f"{line}{when} [{event.severity} severity]"


def facts_block(req: BehaviorRequest) -> str:
    """The facts given to Claude: counts, scores and the most recent events (newest first)."""
    s = req.scores
    lines = [
        f"Trades made: {s.tradeCount}; trades flagged as panic or FOMO: {s.flaggedTrades}",
        f"Impulse control score: {s.impulseControl if s.impulseControl is not None else 'not enough trades yet (needs 3)'}",
        f"Diversification score: {s.diversification}",
        "Pattern counts: " + ", ".join(f"{LABELS[k]} {v}" for k, v in req.counts.items()),
    ]
    if req.largest_position:
        lines.append(f"Largest position: {req.largest_position.symbol} at {req.largest_position.percent}% of the account")
    lines.append("Recent events:")
    lines += [f"- {describe_event(e)}" for e in req.events[:10]] or ["- (none)"]
    return "\n".join(lines)


def rule_based_coaching(req: BehaviorRequest) -> BehaviorCoaching:
    """Deterministic coaching used when Claude is unavailable (no key, API error, refusal)."""
    counts = {k: req.counts.get(k, 0) for k in LABELS}
    if not req.events:
        return BehaviorCoaching(
            headline="No risky habits spotted yet",
            insight=f"Across your {req.scores.tradeCount} trade(s) there are no panic sells, FOMO buys or oversized positions.",
            suggestion="Keep writing down why you buy before each trade, so you can check later whether the reason held.",
        )
    top = max(counts, key=lambda k: counts[k])
    latest = next((e for e in req.events if e.pattern_type == top), req.events[0])
    if top == "panic_sell":
        headline = "You tend to sell after sharp drops"
        suggestion = "Before selling after a drop, wait one day and check whether your reason for owning the stock has changed."
    elif top == "fomo_buy":
        headline = "You tend to buy near recent highs"
        suggestion = "Before buying a stock that just ran up, set the price you would be happy to pay and wait for it."
    else:
        headline = "Too much of your account sits in one stock"
        suggestion = "Decide a maximum share per stock (for example 20%) and trim back to it when a position grows past it."
    insight = (
        f"You have {counts['panic_sell']} panic sell(s), {counts['fomo_buy']} FOMO buy(s) and "
        f"{counts['overconcentration']} overconcentration warning(s). The latest: {describe_event(latest)}."
    )
    return BehaviorCoaching(headline=headline, insight=insight, suggestion=suggestion)

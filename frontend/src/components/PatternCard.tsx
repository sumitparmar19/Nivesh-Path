// Behavioral Mirror building blocks: labels and plain-English explanations for each pattern, the pattern card
// (with "Got it" / "Dismiss"), and the short note shown in the trade panel when a trade is flagged.
import { Link } from "react-router-dom";
import { Check, PieChart, Rocket, TrendingDown, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Pattern, PatternFacts, PatternType, Severity, TradeBehavior } from "../types";
import { money, shortDate } from "../lib/format";
import { stockPath } from "../config/site";
import { Badge, Button, cx } from "./ui";

export const PATTERN_META: Record<PatternType, { label: string; icon: LucideIcon; what: string }> = {
  panic_sell: { label: "Panic sell", icon: TrendingDown, what: "Selling right after a sharp drop, often locking in a loss." },
  fomo_buy: { label: "FOMO buy", icon: Rocket, what: "Buying near a recent high, after the price already ran up." },
  overconcentration: { label: "Overconcentration", icon: PieChart, what: "More than 35% of your whole account in a single stock." },
};

const SEVERITY_TONE: Record<Severity, "amber" | "red" | "muted"> = { low: "muted", medium: "amber", high: "red" };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={SEVERITY_TONE[severity]}>{severity} severity</Badge>;
}

const pct = (n: number | null | undefined) => (typeof n === "number" ? `${Math.abs(n).toFixed(1)}%` : "?");

/** One sentence explaining the pattern, using only the numbers the server computed. */
export function explain(type: PatternType, symbol: string, f: PatternFacts): string {
  if (type === "panic_sell") {
    const v = f.vsCostPct;
    const vsCost = typeof v !== "number" ? "" : Math.abs(v) < 0.05 ? " That was about what you paid on average." : ` That was ${pct(v)} ${v < 0 ? "below" : "above"} what you paid on average.`;
    return `You sold ${symbol} at ${money(f.price ?? 0)} after it fell ${pct(f.fiveDayReturn)} in 5 days.${vsCost}`;
  }
  if (type === "fomo_buy") {
    const runUp = typeof f.fiveDayReturn === "number" && f.fiveDayReturn > 0 ? ` after a ${pct(f.fiveDayReturn)} 5-day run-up` : "";
    return `You bought ${symbol} at ${money(f.price ?? 0)}, just ${pct(f.percentFromHigh)} under its 52-week high of ${money(f.week52High ?? 0)}${runUp}.`;
  }
  return `${symbol} was ${pct(f.percentOfAccount)} of your whole account (${money(f.positionValue ?? 0)} of ${money(f.accountValue ?? 0)}).`;
}

export function PatternCard({ pattern, onAcknowledge, onDismiss, busy }: { pattern: Pattern; onAcknowledge: (id: string) => void; onDismiss: (id: string) => void; busy?: boolean }) {
  const meta = PATTERN_META[pattern.patternType];
  const Icon = meta.icon;
  return (
    <article data-testid={`pattern-${pattern.patternType}`} className={cx("rounded-2xl border border-line bg-surface p-4 shadow-card", pattern.acknowledged && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className={cx("grid h-10 w-10 shrink-0 place-items-center rounded-xl", pattern.severity === "high" ? "bg-down/10 text-down" : "bg-surface-2 text-ink-2")}>
          <Icon size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-bold text-ink">{meta.label}</h3>
            <SeverityBadge severity={pattern.severity} />
            {!pattern.acknowledged && <span className="h-2 w-2 rounded-full bg-down" aria-label="New" />}
            <time className="ml-auto text-xs text-muted" dateTime={pattern.createdAt}>{shortDate(pattern.createdAt)}</time>
          </div>
          <p className="mt-1 text-sm text-ink-2">{explain(pattern.patternType, pattern.symbol, pattern.facts)}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link to={stockPath(pattern.symbol)} className="text-sm font-semibold text-brand-600 hover:underline">{pattern.symbol}</Link>
            <span className="flex-1" />
            {!pattern.acknowledged && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onAcknowledge(pattern._id)}>
                <Check size={14} /> Got it
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(pattern._id)} aria-label={`Dismiss ${meta.label} on ${pattern.symbol}`}>
              <X size={14} /> Dismiss
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

/** Shown under the trade panel when the server flagged the trade just made. */
export function BehaviorNote({ items }: { items: TradeBehavior[] }) {
  if (!items.length) return null;
  return (
    <div role="note" data-testid="behavior-note" className="grid gap-1.5 rounded-xl border border-warn/40 bg-amber-500/10 p-3 text-sm text-ink-2">
      {items.map((b) => (
        <p key={b._id}>
          <strong className="text-ink">Behavioral Mirror: {PATTERN_META[b.patternType].label.toLowerCase()}.</strong>{" "}
          {explain(b.patternType, b.symbol, b.facts)}
        </p>
      ))}
      <Link to="/behavioral-mirror" className="font-semibold text-brand-600 hover:underline">See your trading habits</Link>
    </div>
  );
}

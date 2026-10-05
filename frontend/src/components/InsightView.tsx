// Renders one AI analysis: risk badge, summary, the answer to the user's question, key metrics,
// strengths/risks, recommendations, positions and the past trades the advisor looked up.
import { AlertTriangle, Brain, CheckCircle2 } from "lucide-react";
import { money, pct, tone } from "../lib/format";
import type { AnalysisResult } from "../types";
import { Badge, cx } from "./ui";

const ACTION_TONE = { buy: "brand", hold: "brand", sell: "red", rebalance: "amber", research: "amber" } as const;

export default function InsightView({ data }: { data: AnalysisResult }) {
  const { metrics: m, insight: ins } = data;
  const risk = ins.risk_level;
  return (
    <div data-testid="ai-result" className="grid gap-5">
      <div className="flex flex-wrap gap-2">
        <Badge tone={risk === "high" ? "red" : risk === "medium" ? "amber" : "brand"}>Risk: {risk}</Badge>
        <Badge tone={data.ai_generated ? "brand" : "muted"}>{data.ai_generated ? `AI insight · ${data.model || "Claude"}` : "Rule-based insight (AI offline)"}</Badge>
      </div>
      <p className="text-base leading-relaxed text-ink">{ins.summary}</p>
      {ins.answer && (
        <div className="rounded-xl border-l-4 border-brand-600 bg-brand-50 p-4 text-sm text-ink">
          <strong>Your question: </strong>{ins.answer}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total value", money(m.total_value), ""],
          ["Unrealized P/L", pct(m.total_unrealized_pl_pct), tone(m.total_unrealized_pl)],
          ["Largest position", `${m.largest_position} · ${m.largest_weight_pct.toFixed(0)}%`, ""],
          ["Diversification", `${ins.diversification_score}/100`, ""],
        ].map(([label, value, cls]) => (
          <div key={label} className="rounded-xl border border-line p-3">
            <span className="text-xs text-muted">{label}</span>
            <strong className={cx("block text-lg tabular", cls || "text-ink")}>{value}</strong>
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 font-semibold text-ink">Strengths</h3>
          <ul className="grid gap-1.5 text-sm">{ins.strengths.map((s) => <li key={s} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" />{s}</li>)}</ul>
        </div>
        <div>
          <h3 className="mb-2 font-semibold text-ink">Risks</h3>
          <ul className="grid gap-1.5 text-sm">{ins.risks.map((s) => <li key={s} className="flex gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-warn" />{s}</li>)}</ul>
        </div>
      </div>
      <div>
        <h3 className="mb-2 font-semibold text-ink">Recommendations</h3>
        <div className="grid gap-2">
          {ins.recommendations.map((r, i) => (
            <div key={i} className="flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
              <Badge tone={ACTION_TONE[r.action] ?? "muted"}>{r.action.toUpperCase()}</Badge>
              <span>{r.symbol && <strong>{r.symbol} - </strong>}{r.rationale}</span>
            </div>
          ))}
        </div>
      </div>
      {data.relevant_history.length > 0 && (
        <div>
          <h3 className="mb-1 flex items-center gap-2 font-semibold text-ink"><Brain size={16} className="text-brand-600" /> From your trade history</h3>
          <p className="mb-2 text-sm text-muted">The advisor looked up these {data.relevant_history.length} past trades of yours before answering.</p>
          <ul className="grid gap-1 text-sm text-ink-2">{data.relevant_history.map((h) => <li key={h}>· {h}</li>)}</ul>
        </div>
      )}
      <p className="text-xs text-muted">{data.disclaimer || "Educational insights only - not financial advice."}</p>
    </div>
  );
}

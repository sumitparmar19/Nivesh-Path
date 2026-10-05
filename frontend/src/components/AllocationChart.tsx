// Allocation donut (Recharts) + legend list. Categorical colours from the validated reference palette, in
// fixed order and assigned by ticker (alphabetical), never by rank; cash is a neutral, not a series.
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { money } from "../lib/format";
import { useStore } from "../store/useStore";

const SERIES = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7"],
  dark: ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"],
};
const CASH = { light: "#94a3b8", dark: "#64748b" };
const MAX_NAMED = 6;

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function buildSlices(positions: { symbol: string; market_value: number }[], cash: number, theme: "light" | "dark"): Slice[] {
  const bySize = [...positions].sort((a, b) => b.market_value - a.market_value);
  const named = bySize.slice(0, MAX_NAMED).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const rest = bySize.slice(MAX_NAMED);
  const slices: Slice[] = named.map((p, i) => ({ label: p.symbol, value: p.market_value, color: SERIES[theme][i] }));
  if (rest.length) slices.push({ label: `Other stocks (${rest.length})`, value: rest.reduce((s, p) => s + p.market_value, 0), color: SERIES[theme][MAX_NAMED] });
  slices.push({ label: "Cash", value: cash, color: CASH[theme] });
  return slices.filter((s) => s.value > 0);
}

export default function AllocationChart({ positions, cash, total }: { positions: { symbol: string; market_value: number }[]; cash: number; total: number }) {
  const theme = useStore((s) => s.theme);
  const slices = buildSlices(positions, cash, theme);
  const share = (v: number) => (total ? ((v / total) * 100).toFixed(1) : "0.0");
  return (
    <div className="grid items-center gap-5 sm:grid-cols-[190px_1fr]">
      <div className="relative mx-auto h-[190px] w-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={62} outerRadius={90} paddingAngle={slices.length > 1 ? 1 : 0} stroke="rgb(var(--surface))" strokeWidth={2} isAnimationActive={false}>
              {slices.map((s) => <Cell key={s.label} fill={s.color} />)}
            </Pie>
            <Tooltip
              formatter={(value: number, name: string) => [`${money(value)} (${share(value)}%)`, name]}
              contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 10, color: "rgb(var(--ink))" }}
              itemStyle={{ color: "rgb(var(--ink))" }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <strong className="font-display text-lg tabular text-ink">{money(total)}</strong>
          <span className="text-xs text-muted">total value</span>
        </div>
      </div>
      <ul className="grid gap-2" aria-label="Allocation">
        {slices.map((s) => (
          <li key={s.label} className="grid grid-cols-[12px_1fr_auto] items-center gap-2.5 text-sm">
            <span className="h-3 w-3 rounded" style={{ background: s.color }} />
            <span className="text-ink">{s.label} <span className="text-muted">· {money(s.value)}</span></span>
            <span className="font-semibold tabular text-muted">{share(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

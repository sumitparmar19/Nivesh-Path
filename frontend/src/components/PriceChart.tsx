// Price chart for a stock page. Uses our own candle data (/api/stocks/:symbol/candles) when the Finnhub
// plan provides it; otherwise embeds TradingView's chart widget inside the page (never as a link out).
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { money, shortDate } from "../lib/format";
import { useStore } from "../store/useStore";
import { Skeleton, cx } from "./ui";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 1825 },
] as const;

export function TradingViewChart({ tvSymbol }: { tvSymbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js";
    script.async = true;
    script.textContent = JSON.stringify({
      symbols: [[tvSymbol, `${tvSymbol}|12M`]],
      chartType: "area", autosize: true, colorTheme: theme, isTransparent: true, showVolume: false,
      lineColor: "#16a34a", topColor: "rgba(22,163,74,0.25)", bottomColor: "rgba(22,163,74,0)",
      dateRanges: ["1d|1", "1m|30", "3m|60", "12m|1D", "60m|1W", "all|1M"],
    });
    box.appendChild(script);
    return () => {
      box.innerHTML = "";
    };
  }, [tvSymbol, theme]);
  return <div ref={ref} className="tradingview-widget-container h-full w-full" data-testid="tradingview-chart" />;
}

export default function PriceChart({ symbol, tvSymbol }: { symbol: string; tvSymbol: string }) {
  const [days, setDays] = useState<number>(365);
  const candles = useQuery({ queryKey: ["candles", symbol, days], queryFn: () => api.stocks.candles(symbol, days), staleTime: 3_600_000 });
  const points = useMemo(() => (candles.data?.points || []).map((p) => ({ t: p.t * 1000, c: p.c })), [candles.data]);

  if (candles.isLoading) return <Skeleton className="h-full min-h-[320px]" />;
  if (!candles.data?.available || points.length < 2) return <TradingViewChart tvSymbol={tvSymbol} />;

  const first = points[0].c;
  const last = points[points.length - 1].c;
  const up = last >= first;
  const color = up ? "#16a34a" : "#dc2626";
  return (
    <div className="flex h-full flex-col" data-testid="own-chart">
      <div className="mb-2 flex gap-1" role="tablist" aria-label="Chart range">
        {RANGES.map((r) => (
          <button key={r.label} type="button" role="tab" aria-selected={days === r.days} onClick={() => setDays(r.days)} className={cx("rounded-lg px-3 py-1 text-xs font-bold", days === r.days ? "bg-brand-50 text-brand-700" : "text-muted hover:text-ink")}>
            {r.label}
          </button>
        ))}
      </div>
      <div className="min-h-[280px] flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgb(var(--line))" vertical={false} />
            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tickFormatter={(t: number) => shortDate(t)} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={40} />
            <YAxis domain={["auto", "auto"]} tickFormatter={(v: number) => `$${v.toFixed(0)}`} tick={{ fill: "rgb(var(--muted))", fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip
              labelFormatter={(t: number) => shortDate(t)}
              formatter={(v: number) => [money(v), "Close"]}
              contentStyle={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--line))", borderRadius: 10 }}
            />
            <Area type="monotone" dataKey="c" stroke={color} strokeWidth={2} fill="url(#pc)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

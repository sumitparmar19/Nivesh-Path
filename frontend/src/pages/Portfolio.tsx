// Portfolio (the signed-in home): totals, allocation, sortable holdings at live prices, recent activity
// and the AI memory panel. Data: /api/portfolio/cash-balance + /api/transactions (refreshed every 60s).
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownUp, Briefcase, ChartPie, History, Search, Sparkles, Wand2 } from "lucide-react";
import AllocationChart from "../components/AllocationChart";
import MemoryPanel from "../components/MemoryPanel";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, Stat, StockLogo, cx } from "../components/ui";
import { featured, stockPath } from "../config/site";
import { api } from "../lib/api";
import { dateTime, money, pct, signedMoney, tone } from "../lib/format";
import { useStore } from "../store/useStore";
import type { Position } from "../types";

type SortKey = "symbol" | "quantity" | "market_value" | "pl" | "pl_pct" | "weight";
interface Row extends Position {
  pl: number;
  pl_pct: number;
  weight: number;
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "symbol", label: "Stock" },
  { key: "quantity", label: "Shares" },
  { key: "market_value", label: "Value" },
  { key: "pl", label: "P&L" },
  { key: "pl_pct", label: "P&L %" },
  { key: "weight", label: "Weight" },
];

export default function Portfolio() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "market_value", dir: -1 });
  const summary = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio.summary, refetchInterval: 60_000 });
  const trades = useQuery({ queryKey: ["transactions"], queryFn: api.portfolio.transactions });
  const s = summary.data;

  const rows: Row[] = useMemo(() => {
    if (!s) return [];
    const list = s.positions.map((p) => {
      const pl = p.market_value - p.cost_basis;
      return { ...p, pl, pl_pct: p.cost_basis ? (pl / p.cost_basis) * 100 : 0, weight: s.totalValue ? (p.market_value / s.totalValue) * 100 : 0 };
    });
    return list.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      return (typeof av === "string" ? av.localeCompare(String(bv)) : (av as number) - (bv as number)) * sort.dir;
    });
  }, [s, sort]);

  const recent = useMemo(() => [...(trades.data || [])].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)).slice(0, 5), [trades.data]);
  const firstName = user?.name ? user.name.split(" ")[0] : "";

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Paper trading account"
        title="Your portfolio"
        lede={firstName ? `Hi ${firstName}, here's where your money is.` : "Cash, holdings and performance at live prices."}
        action={
          <div className="flex flex-wrap gap-2">
            <ButtonLink to="/markets" variant="ghost"><Search size={16} /> Trade stocks</ButtonLink>
            <ButtonLink to="/advisor"><Wand2 size={16} /> Ask the AI advisor</ButtonLink>
          </div>
        }
      />

      {summary.isError && <ErrorState message="Couldn't load your portfolio." onRetry={() => summary.refetch()} />}

      {s && s.positions.length === 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-brand-100 bg-brand-50 p-5">
          <Sparkles className="text-brand-600" />
          <div className="flex-1">
            <strong className="block text-ink">Welcome! You have {money(s.cashBalance)} in virtual cash.</strong>
            <span className="text-sm text-ink-2">Buy any US stock at the live price. Your trades build the history the AI advisor learns from.</span>
          </div>
          <ButtonLink to="/markets">Make your first trade</ButtonLink>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summary.isLoading || !s ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        ) : (
          <>
            <Stat highlight label="Cash available" value={money(s.cashBalance)} testId="cash-balance" foot={<Link to="/markets" className="underline">Buy more stocks</Link>} />
            <Stat label="Invested" value={money(s.holdingsValue)} foot={`${s.positions.length} holding${s.positions.length === 1 ? "" : "s"} · unrealized ${signedMoney(s.unrealizedPnl)}`} />
            <Stat label="Total value" value={money(s.totalValue)} foot="Cash + holdings" testId="total-value" />
            <Stat label="Total P&L" value={signedMoney(s.totalPnl)} valueClass={tone(s.totalPnl)} testId="total-pnl" foot={`${pct(s.totalPnlPercent)} since you started with ${money(s.totalDeposited)}`} />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
        <Card>
          <CardHeader title="Allocation" icon={<ChartPie size={18} />} action={s ? <Badge tone="muted">{s.positions.length} holdings</Badge> : null} />
          {s ? <AllocationChart positions={s.positions} cash={s.cashBalance} total={s.totalValue} /> : <Skeleton className="h-48" />}
        </Card>
        <MemoryPanel />
      </div>

      <Card className="overflow-hidden p-0">
        <div className="p-5 pb-0"><CardHeader title="Holdings" icon={<Briefcase size={18} />} action={<span className="text-sm text-muted">Prices refresh every 60 seconds</span>} /></div>
        {s && rows.length === 0 ? (
          <EmptyState icon={<Briefcase />} title="No holdings yet" action={<ButtonLink to="/markets">Browse markets</ButtonLink>}>
            No holdings yet. Browse Markets to buy your first stock.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-y border-line bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={cx("px-5 py-3", c.key !== "symbol" && "text-right")} aria-sort={sort.key === c.key ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button type="button" className="inline-flex items-center gap-1 font-semibold uppercase" onClick={() => setSort({ key: c.key, dir: sort.key === c.key ? (sort.dir === 1 ? -1 : 1) : c.key === "symbol" ? 1 : -1 })}>
                        {c.label} <ArrowDownUp size={12} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.symbol} data-testid={`holding-${r.symbol}`} onClick={() => navigate(stockPath(r.symbol))} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3">
                        <StockLogo src={featured(r.symbol)?.logo} symbol={r.symbol} />
                        <span><strong className="block text-ink">{r.symbol}</strong><span className="text-xs text-muted">{featured(r.symbol)?.name || ""} · avg {money(r.avg_price)}</span></span>
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular">{r.quantity}</td>
                    <td className="px-5 py-3 text-right tabular"><strong>{money(r.market_value)}</strong><span className="block text-xs text-muted">@ {money(r.current_price)}</span></td>
                    <td className={cx("px-5 py-3 text-right tabular", tone(r.pl))}>{signedMoney(r.pl)}</td>
                    <td className={cx("px-5 py-3 text-right tabular", tone(r.pl_pct))}>{pct(r.pl_pct)}</td>
                    <td className="px-5 py-3 text-right tabular">{r.weight.toFixed(1)}%</td>
                  </tr>
                ))}
                {!s && [0, 1].map((i) => <tr key={i}><td colSpan={6} className="px-5 py-3"><Skeleton className="h-4" /></td></tr>)}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent activity" icon={<History size={18} />} action={<Link to="/transactions" className="text-sm font-semibold text-brand-600">View all</Link>} />
        {recent.length === 0 ? (
          <p className="text-sm text-muted">{trades.isLoading ? "Loading…" : "No trades yet - your buys and sells will appear here."}</p>
        ) : (
          <ul className="divide-y divide-dashed divide-line">
            {recent.map((t) => (
              <li key={t._id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="flex items-center gap-3">
                  <Badge tone={t.transactionType === "buy" ? "brand" : "red"}>{t.transactionType === "buy" ? "Buy" : "Sell"}</Badge>
                  <span>
                    <Link to={stockPath(t.name)} className="font-semibold text-ink hover:text-brand-600">{t.quantity} {t.name}</Link>
                    <span className="text-muted"> @ {money(t.price)}</span>
                    <span className="block text-xs text-muted">{dateTime(t.timestamp)}</span>
                  </span>
                </span>
                <strong className="tabular">{money(t.total)}</strong>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

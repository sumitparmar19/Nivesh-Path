// Transactions: every trade with cash/value/P&L totals, Buy/Sell filter, symbol search, date range,
// 25-per-page pagination and CSV export of the filtered rows.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Receipt, Search, Wand2 } from "lucide-react";
import { Badge, Button, ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, Stat, cx } from "../components/ui";
import { stockPath } from "../config/site";
import { api } from "../lib/api";
import { downloadText, tradesToCsv } from "../lib/csv";
import { dateTime, money, pct, signedMoney, tone } from "../lib/format";

const PAGE_SIZE = 25;
type Filter = "all" | "buy" | "sell";

export default function Transactions() {
  const trades = useQuery({ queryKey: ["transactions"], queryFn: api.portfolio.transactions });
  const summary = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio.summary });
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = q.trim().toUpperCase();
    const fromTs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toTs = to ? new Date(`${to}T23:59:59`).getTime() : Infinity;
    return [...(trades.data || [])]
      .filter((t) => (filter === "all" || t.transactionType === filter) && (!term || t.name.toUpperCase().includes(term)))
      .filter((t) => {
        const ts = new Date(t.timestamp).getTime();
        return ts >= fromTs && ts <= toTs;
      })
      .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  }, [trades.data, filter, q, from, to]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const s = summary.data;
  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Portfolio" title="Transactions" lede="Every buy and sell you've made, with your virtual cash and portfolio value." action={<ButtonLink to="/advisor"><Wand2 size={16} /> Analyze with AI</ButtonLink>} />

      <div className="grid gap-4 sm:grid-cols-3">
        {s ? (
          <>
            <Stat highlight label="Cash balance" value={money(s.cashBalance)} foot="Virtual paper-trading cash" />
            <Stat label="Portfolio value" value={money(s.totalValue)} foot={`${money(s.holdingsValue)} in ${s.positions.length} holding${s.positions.length === 1 ? "" : "s"}`} />
            <Stat label="Total P&L" value={signedMoney(s.totalPnl)} valueClass={tone(s.totalPnl)} foot={`${pct(s.totalPnlPercent)} since you started with ${money(s.totalDeposited)}`} />
          </>
        ) : (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        )}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <div className="inline-flex rounded-xl border border-line bg-surface-2 p-1" role="tablist" aria-label="Filter by type">
            {(["all", "buy", "sell"] as Filter[]).map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} onClick={() => resetPage(setFilter)(f)} className={cx("rounded-lg px-3.5 py-1.5 text-sm font-semibold", filter === f ? "bg-surface text-ink shadow-card" : "text-muted")}>
                {f === "all" ? "All" : f === "buy" ? "Buys" : "Sells"}
              </button>
            ))}
          </div>
          <label className="relative">
            <span className="sr-only">Search by symbol</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={q} onChange={(e) => resetPage(setQ)(e.target.value)} placeholder="Search symbol…" className="w-40 pl-9 text-sm" />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-muted">From<input type="date" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} className="text-sm" /></label>
          <label className="grid gap-1 text-xs font-semibold text-muted">To<input type="date" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} className="text-sm" /></label>
          <Button variant="ghost" size="sm" className="ml-auto" disabled={!filtered.length} onClick={() => downloadText("nivesh-path-trades.csv", tradesToCsv(filtered))}>
            <Download size={15} /> Export CSV
          </Button>
        </div>

        {trades.isError && <div className="p-4"><ErrorState message="Couldn't load your transactions." onRetry={() => trades.refetch()} /></div>}
        {trades.isLoading && <div className="grid gap-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-4" />)}</div>}

        {trades.data && filtered.length === 0 ? (
          <EmptyState icon={<Receipt />} title={trades.data.length ? "No matching trades" : "No trades yet"} action={trades.data.length ? undefined : <ButtonLink to="/markets">Explore stocks</ButtonLink>}>
            {trades.data.length ? "Try another filter, symbol or date range." : "Pick a stock and place your first trade, then it will show up here."}
          </EmptyState>
        ) : (
          visible.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-surface-2 text-left text-xs uppercase tracking-wide text-muted">
                  <tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Type</th><th className="px-5 py-3">Stock</th><th className="px-5 py-3 text-right">Qty</th><th className="px-5 py-3 text-right">Price</th><th className="px-5 py-3 text-right">Total</th></tr>
                </thead>
                <tbody>
                  {visible.map((t) => (
                    <tr key={t._id} data-testid="trade-row" className="border-t border-line">
                      <td className="px-5 py-3 text-muted">{dateTime(t.timestamp)}</td>
                      <td className="px-5 py-3"><Badge tone={t.transactionType === "buy" ? "brand" : "red"}>{t.transactionType === "buy" ? "Buy" : "Sell"}</Badge></td>
                      <td className="px-5 py-3"><Link to={stockPath(t.name)} className="font-semibold text-ink hover:text-brand-600">{t.name}</Link></td>
                      <td className="px-5 py-3 text-right tabular">{t.quantity}</td>
                      <td className="px-5 py-3 text-right tabular">{money(t.price)}</td>
                      <td className="px-5 py-3 text-right tabular font-semibold">{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between border-t border-line p-4 text-sm">
            <span className="text-muted">Showing {(current - 1) * PAGE_SIZE + 1}-{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</Button>
            </span>
          </nav>
        )}
      </Card>
    </div>
  );
}

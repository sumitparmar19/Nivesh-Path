// Markets: search any US ticker, a market overview (index ETFs), today's movers among the featured stocks,
// and 50 curated stocks by sector with watchlist stars. Every click opens our own stock page.
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers, TrendingDown, TrendingUp } from "lucide-react";
import StockSearch from "../components/StockSearch";
import WatchButton from "../components/WatchButton";
import { Card, CardHeader, ErrorState, PageHeader, Skeleton, StockLogo, cx } from "../components/ui";
import { FEATURED, featured, stockPath } from "../config/site";
import { api } from "../lib/api";
import { money, pct, tone } from "../lib/format";
import type { StockQuote } from "../types";

const INDEX_ETFS = [
  { symbol: "SPY", label: "S&P 500" },
  { symbol: "QQQ", label: "Nasdaq-100" },
  { symbol: "DIA", label: "Dow Jones" },
  { symbol: "IWM", label: "Russell 2000" },
  { symbol: "VTI", label: "Total US market" },
];

function StockRow({ symbol, name, price, changePercent, star = false }: { symbol: string; name: string; price?: number | null; changePercent?: number | null; star?: boolean }) {
  return (
    <Link to={stockPath(symbol)} data-testid={`row-${symbol}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto] items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition hover:-translate-y-px hover:border-brand-100 hover:shadow-card">
      <StockLogo src={featured(symbol)?.logo} symbol={symbol} />
      <span className="min-w-0"><strong className="block truncate text-ink">{name}</strong><span className="text-xs text-muted">{symbol}</span></span>
      <span className="text-right tabular"><strong className="block text-ink">{money(price)}</strong><span className={cx("text-xs font-semibold", tone(changePercent))}>{pct(changePercent)}</span></span>
      {star ? <WatchButton symbol={symbol} compact /> : <span />}
    </Link>
  );
}

export default function Markets() {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const popular = useQuery({ queryKey: ["popular"], queryFn: api.stocks.popular, refetchInterval: 60_000 });
  const indices = useQuery({ queryKey: ["quotes", "indices"], queryFn: () => api.stocks.quotes(INDEX_ETFS.map((e) => e.symbol)), refetchInterval: 60_000 });
  const curated = useQuery({ queryKey: ["curated"], queryFn: api.stocks.curated, staleTime: Infinity });
  const sector = curated.data?.[tab];
  const sectorQuotes = useQuery({
    queryKey: ["quotes", "sector", sector?.category],
    queryFn: () => api.stocks.quotes((sector?.stocks || []).map((s) => s.symbol)),
    enabled: !!sector,
    refetchInterval: 60_000,
  });

  const movers = useMemo(() => {
    const q = popular.data || {};
    const list = FEATURED.filter((s) => q[s.symbol]).map((s) => ({ ...s, price: q[s.symbol].c, dp: q[s.symbol].dp ?? 0 }));
    const sorted = [...list].sort((a, b) => b.dp - a.dp);
    return { gainers: sorted.slice(0, 5), losers: sorted.slice(-5).reverse() };
  }, [popular.data]);
  const total = curated.data?.reduce((n, c) => n + c.stocks.length, 0) || 0;

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Markets" title="Find a stock" lede="Live prices for popular US stocks and ETFs. Search any NYSE or NASDAQ ticker to open it and trade with virtual cash." />
      <StockSearch onPick={(s) => navigate(stockPath(s))} />

      <section aria-label="Market overview" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {INDEX_ETFS.map((e) => {
          const q: StockQuote | undefined = indices.data?.[e.symbol];
          return (
            <Link key={e.symbol} to={stockPath(e.symbol)} className="grid gap-1 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-brand-100">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">{e.label}</span>
              <strong className="font-display text-xl tabular text-ink">{q ? money(q.price) : <Skeleton className="h-6 w-20" />}</strong>
              <span className={cx("text-sm font-semibold tabular", tone(q?.changePercent))}>{e.symbol} · {pct(q?.changePercent)}</span>
            </Link>
          );
        })}
      </section>

      {popular.isError && <ErrorState message="Live prices are unavailable right now. Please try again in a minute." onRetry={() => popular.refetch()} />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top gainers today" icon={<TrendingUp size={18} />} action={<span className="text-xs text-muted">Among the 12 featured stocks</span>} />
          <div className="grid gap-2">{popular.data ? movers.gainers.map((s) => <StockRow key={s.symbol} symbol={s.symbol} name={s.name} price={s.price} changePercent={s.dp} />) : <Skeleton className="h-40" />}</div>
        </Card>
        <Card>
          <CardHeader title="Top losers today" icon={<TrendingDown size={18} />} action={<span className="text-xs text-muted">Among the 12 featured stocks</span>} />
          <div className="grid gap-2">{popular.data ? movers.losers.map((s) => <StockRow key={s.symbol} symbol={s.symbol} name={s.name} price={s.price} changePercent={s.dp} />) : <Skeleton className="h-40" />}</div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Browse by sector" icon={<Layers size={18} />} action={total ? <span className="text-sm text-muted">{total} stocks &amp; ETFs</span> : null} />
        <div role="tablist" aria-label="Sectors" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
          {(curated.data || []).map((c, i) => (
            <button key={c.category} type="button" role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cx("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === i ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
              {c.category}
            </button>
          ))}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2" data-testid="sector-list">
          {!sector ? <Skeleton className="h-40" /> : sector.stocks.map((s) => {
            const q = sectorQuotes.data?.[s.symbol];
            return <StockRow key={s.symbol} symbol={s.symbol} name={s.name} price={q?.price} changePercent={q?.changePercent} star />;
          })}
        </div>
      </Card>
    </div>
  );
}

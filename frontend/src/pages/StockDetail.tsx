// Stock page for any US ticker (/stock/:symbol): live quote, chart, key stats, company profile, the user's
// position, Buy/Sell, latest news and more stocks from the same sector. Public; trading needs login.
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Newspaper } from "lucide-react";
import PriceChart from "../components/PriceChart";
import TradePanel from "../components/TradePanel";
import WatchButton from "../components/WatchButton";
import { ButtonLink, Card, CardHeader, EmptyState, Skeleton, StockLogo, cx } from "../components/ui";
import { EXCHANGE, featured, stockPath } from "../config/site";
import { api } from "../lib/api";
import { bigMoney, dateTime, money, num, pct, signedMoney, timeAgo, tone } from "../lib/format";
import { useStore } from "../store/useStore";

function exchangeCode(symbol: string, exchange?: string | null): string {
  if (EXCHANGE[symbol]) return EXCHANGE[symbol];
  if (!exchange) return "";
  if (/nasdaq/i.test(exchange)) return "NASDAQ";
  if (/new york|nyse/i.test(exchange)) return "NYSE";
  return "";
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid gap-1 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <strong className="break-words tabular text-ink">{value}</strong>
    </div>
  );
}

export default function StockDetail() {
  const symbol = (useParams().symbol || "").toUpperCase();
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const quote = useQuery({ queryKey: ["quote", symbol], queryFn: () => api.stocks.quote(symbol), refetchInterval: 30_000, retry: false });
  const profile = useQuery({ queryKey: ["profile", symbol], queryFn: () => api.stocks.profile(symbol), staleTime: 86_400_000, retry: false });
  const metrics = useQuery({ queryKey: ["metrics", symbol], queryFn: () => api.stocks.metrics(symbol), staleTime: 3_600_000, retry: false });
  const news = useQuery({ queryKey: ["news", symbol], queryFn: () => api.stocks.news(symbol), staleTime: 3_600_000, retry: false });
  const curated = useQuery({ queryKey: ["curated"], queryFn: api.stocks.curated, staleTime: Infinity });
  const summary = useQuery({ queryKey: ["portfolio"], queryFn: api.portfolio.summary, enabled: isAuthenticated });
  const trades = useQuery({ queryKey: ["transactions"], queryFn: api.portfolio.transactions, enabled: isAuthenticated });

  const sector = useMemo(() => curated.data?.find((c) => c.stocks.some((s) => s.symbol === symbol)), [curated.data, symbol]);
  const peers = useMemo(() => (sector ? sector.stocks.filter((s) => s.symbol !== symbol).slice(0, 6) : []), [sector, symbol]);
  const peerQuotes = useQuery({ queryKey: ["quotes", peers.map((p) => p.symbol).join(",")], queryFn: () => api.stocks.quotes(peers.map((p) => p.symbol)), enabled: peers.length > 0 });

  if (!/^[A-Z][A-Z.]{0,9}$/.test(symbol) || (quote.isError && !quote.data)) {
    return (
      <Card>
        <EmptyState title={`We don't have data for ${symbol || "that ticker"}`} action={<ButtonLink to="/markets">Search markets</ButtonLink>}>
          Try searching for a valid US ticker on NYSE or NASDAQ.
        </EmptyState>
      </Card>
    );
  }

  const q = quote.data;
  const p = profile.data;
  const m = metrics.data;
  const name = p?.name || featured(symbol)?.name || sector?.stocks.find((s) => s.symbol === symbol)?.name || symbol;
  const logo = p?.logo || featured(symbol)?.logo;
  const ex = exchangeCode(symbol, p?.exchange);
  const position = summary.data?.positions.find((x) => x.symbol === symbol);
  const pastTrades = (trades.data || []).filter((t) => t.name.toUpperCase() === symbol).length;
  const posPl = position ? position.market_value - position.cost_basis : 0;

  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <StockLogo src={logo} symbol={symbol} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-extrabold text-ink sm:text-3xl">{name} <span className="text-base font-semibold text-muted">{symbol}</span></h1>
            <p className="text-sm text-muted">{[ex || p?.exchange, p?.industry].filter(Boolean).join(" · ") || "US stock"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {q ? (
            <>
              <strong className="font-display text-3xl tabular text-ink" data-testid="stock-price">{money(q.price)}</strong>
              <span className={cx("font-semibold tabular", tone(q.change))}>{signedMoney(q.change)} ({pct(q.changePercent)})</span>
            </>
          ) : (
            <Skeleton className="h-9 w-40" />
          )}
          <WatchButton symbol={symbol} />
        </div>
        {q?.time && <p className="w-full text-xs text-muted">Last updated {dateTime(q.time)} · refreshes every 30 seconds</p>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-6">
          <Card className="h-[420px]">
            <PriceChart symbol={symbol} tvSymbol={ex ? `${ex}:${symbol}` : symbol} />
          </Card>

          <Card>
            <CardHeader title="Key stats" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              <Fact label="Open" value={money(q?.open)} />
              <Fact label="Previous close" value={money(q?.prevClose)} />
              <Fact label="Day high" value={money(q?.high)} />
              <Fact label="Day low" value={money(q?.low)} />
              <Fact label="52-week high" value={money(m?.week52High)} />
              <Fact label="52-week low" value={money(m?.week52Low)} />
              <Fact label="Market cap" value={bigMoney(m?.marketCap ?? p?.marketCap)} />
              <Fact label="P/E (TTM)" value={num(m?.peTTM)} />
              <Fact label="EPS (TTM)" value={money(m?.epsTTM)} />
              <Fact label="Beta" value={num(m?.beta)} />
              <Fact label="Dividend yield" value={m?.dividendYield == null ? "—" : `${num(m.dividendYield)}%`} />
              <Fact label="Avg. volume (10d)" value={m?.avgVolume10d == null ? "—" : `${num(m.avgVolume10d)}M`} />
            </div>
            <p className="mt-3 text-xs text-muted">{metrics.isError ? "Key stats are unavailable right now." : "Source: Finnhub · updated hourly"}</p>
          </Card>

          <Card>
            <CardHeader title={`About ${name}`} />
            {profile.isLoading ? <Skeleton className="h-20" /> : p ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Fact label="Industry" value={p.industry || p.type || "—"} />
                <Fact label="Exchange" value={p.exchange || "—"} />
                <Fact label="Country" value={p.country || "—"} />
                <Fact label="Listed since" value={p.ipo || "—"} />
                <Fact label="Market cap" value={bigMoney(p.marketCap)} />
                <Fact label="Website" value={p.website ? <a className="text-brand-600 hover:underline" href={p.website} target="_blank" rel="noopener noreferrer">{p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : "—"} />
              </div>
            ) : (
              <p className="text-sm text-muted">Company profile is unavailable for {symbol}.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Latest news" icon={<Newspaper size={18} />} />
            {news.isLoading ? <Skeleton className="h-24" /> : !news.data?.length ? (
              <p className="text-sm text-muted">{news.isError ? "News is unavailable right now." : `No recent news for ${symbol}.`}</p>
            ) : (
              <ul className="divide-y divide-dashed divide-line">
                {news.data.map((n) => (
                  <li key={n.url}>
                    <a href={n.url} target="_blank" rel="noopener noreferrer" className="group grid gap-1 py-3">
                      <strong className="font-semibold leading-snug text-ink group-hover:text-brand-600">{n.headline}</strong>
                      <span className="flex items-center gap-1 text-xs text-muted">{n.source}{n.datetime ? ` · ${timeAgo(n.datetime)}` : ""} <ExternalLink size={11} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <TradePanel symbol={symbol} price={q?.price ?? null} cash={summary.data?.cashBalance ?? null} owned={position?.quantity ?? 0} />
          {isAuthenticated && (
            <Card>
              <h3 className="mb-2 font-semibold text-ink">Your position</h3>
              {position ? (
                <div className="grid grid-cols-2 gap-3 text-sm" data-testid="position">
                  <span><span className="block text-xs text-muted">Shares</span><strong className="tabular">{position.quantity}</strong></span>
                  <span><span className="block text-xs text-muted">Avg cost</span><strong className="tabular">{money(position.avg_price)}</strong></span>
                  <span><span className="block text-xs text-muted">Value</span><strong className="tabular">{money(position.market_value)}</strong></span>
                  <span><span className="block text-xs text-muted">P&amp;L</span><strong className={cx("tabular", tone(posPl))}>{signedMoney(posPl)} ({pct(position.cost_basis ? (posPl / position.cost_basis) * 100 : 0)})</strong></span>
                </div>
              ) : (
                <p className="text-sm text-muted" data-testid="position">
                  You don&apos;t own {symbol} yet.{pastTrades > 0 && <> {pastTrades} past trade{pastTrades === 1 ? "" : "s"} · <Link className="text-brand-600" to="/transactions">history</Link></>}
                </p>
              )}
            </Card>
          )}
          {peers.length > 0 && (
            <Card>
              <h3 className="mb-3 font-semibold text-ink">More in {sector?.category}</h3>
              <ul className="grid gap-2">
                {peers.map((s) => {
                  const pq = peerQuotes.data?.[s.symbol];
                  return (
                    <li key={s.symbol}>
                      <Link to={stockPath(s.symbol)} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl border border-line p-2.5 hover:border-brand-100">
                        <StockLogo src={featured(s.symbol)?.logo} symbol={s.symbol} />
                        <span className="min-w-0"><strong className="block truncate text-sm text-ink">{s.name}</strong><span className="text-xs text-muted">{s.symbol}</span></span>
                        <span className="text-right text-sm tabular"><strong className="block">{money(pq?.price)}</strong><span className={cx("text-xs", tone(pq?.changePercent))}>{pct(pq?.changePercent)}</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

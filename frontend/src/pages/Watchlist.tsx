// Watchlist: stocks the user follows with live prices (batch quotes, refreshed every 60s), add via search,
// remove with one click, and a Trade link to each stock page. Saved per user in MongoDB.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Star, X } from "lucide-react";
import StockSearch from "../components/StockSearch";
import { useWatchlist } from "../components/WatchButton";
import { ButtonLink, Card, EmptyState, ErrorState, PageHeader, Skeleton, StockLogo, cx } from "../components/ui";
import { featured, stockPath } from "../config/site";
import { api } from "../lib/api";
import { money, pct, shortDate, tone } from "../lib/format";
import { useStore } from "../store/useStore";
import type { WatchlistItem } from "../types";

const MAX_ITEMS = 100;

export default function Watchlist() {
  const client = useQueryClient();
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const list = useWatchlist();
  const symbols = (list.data || []).map((w) => w.symbol);
  const quotes = useQuery({
    queryKey: ["quotes", "watchlist", symbols.join(",")],
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += 20) chunks.push(symbols.slice(i, i + 20));
      const parts = await Promise.all(chunks.map((c) => api.stocks.quotes(c)));
      return Object.assign({}, ...parts) as Awaited<ReturnType<typeof api.stocks.quotes>>;
    },
    enabled: symbols.length > 0,
    refetchInterval: 60_000,
  });

  const add = useMutation({
    mutationFn: api.watchlist.add,
    onSuccess: (item) => {
      client.setQueryData<WatchlistItem[]>(["watchlist"], (old = []) => (old.some((w) => w.symbol === item.symbol) ? old : [item, ...old]));
      toast(`${item.symbol} added to your watchlist.`, "success", "Watchlist");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });
  const remove = useMutation({
    mutationFn: api.watchlist.remove,
    onSuccess: (_r, symbol) => {
      client.setQueryData<WatchlistItem[]>(["watchlist"], (old = []) => old.filter((w) => w.symbol !== symbol));
      toast(`${symbol} removed from your watchlist.`, "success", "Watchlist");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  return (
    <div className="grid gap-6">
      <PageHeader eyebrow="Watchlist" title="Stocks you're watching" lede="Star any stock to follow it here. Saved to your account, so it's the same on every device." />
      <StockSearch onPick={(s) => add.mutate(s)} placeholder="Add a stock: search by company or ticker" />

      <Card>
        {list.isError && <ErrorState message="Your watchlist is unavailable right now." onRetry={() => list.refetch()} />}
        {list.isLoading ? (
          <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : !list.data?.length ? (
          <EmptyState icon={<Star />} title="Nothing here yet" action={<ButtonLink to="/markets">Browse markets</ButtonLink>}>
            No stocks on your watchlist. Add one above, or tap Watch on any stock page.
          </EmptyState>
        ) : (
          <ul className="grid gap-2" aria-label="Watchlist">
            {list.data.map((w) => {
              const q = quotes.data?.[w.symbol];
              return (
                <li key={w.symbol} data-testid={`watch-row-${w.symbol}`} className="grid grid-cols-[40px_minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded-xl border border-line p-2.5">
                  <StockLogo src={featured(w.symbol)?.logo} symbol={w.symbol} />
                  <Link to={stockPath(w.symbol)} className="min-w-0">
                    <strong className="block truncate text-ink">{featured(w.symbol)?.name || w.symbol}</strong>
                    <span className="text-xs text-muted">{w.symbol} · added {shortDate(w.addedAt)}</span>
                  </Link>
                  <span className="text-right tabular"><strong className="block">{money(q?.price)}</strong><span className={cx("text-xs font-semibold", tone(q?.changePercent))}>{pct(q?.changePercent)}</span></span>
                  <button type="button" onClick={() => navigate(stockPath(w.symbol))} className="hidden rounded-lg border border-line px-3 py-1.5 text-sm font-semibold sm:block">Trade</button>
                  <button type="button" aria-label={`Remove ${w.symbol}`} disabled={remove.isPending} onClick={() => remove.mutate(w.symbol)} className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:border-down/30 hover:bg-down/10 hover:text-down">
                    <X size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!!list.data?.length && <p className="mt-3 text-xs text-muted">{list.data.length} of {MAX_ITEMS} · prices refresh every 60 seconds</p>}
      </Card>
    </div>
  );
}

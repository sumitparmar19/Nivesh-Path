// Star button that adds/removes a stock from the user's watchlist (synced to MongoDB). Logged-out users
// are sent to login first.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import type { WatchlistItem } from "../types";
import { cx } from "./ui";

export function useWatchlist() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  return useQuery({ queryKey: ["watchlist"], queryFn: api.watchlist.list, enabled: isAuthenticated });
}

export default function WatchButton({ symbol, compact = false }: { symbol: string; compact?: boolean }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const toast = useStore((s) => s.toast);
  const navigate = useNavigate();
  const client = useQueryClient();
  const list = useWatchlist();
  const watched = !!list.data?.some((w) => w.symbol === symbol);

  const toggle = useMutation({
    mutationFn: async (): Promise<void> => {
      if (watched) await api.watchlist.remove(symbol);
      else await api.watchlist.add(symbol);
    },
    onSuccess: () => {
      client.setQueryData<WatchlistItem[]>(["watchlist"], (old = []) =>
        watched ? old.filter((w) => w.symbol !== symbol) : [{ symbol, addedAt: new Date().toISOString() }, ...old],
      );
      toast(watched ? `${symbol} removed from your watchlist.` : `${symbol} added to your watchlist.`, "success", "Watchlist");
    },
    onError: () => toast("Couldn't update your watchlist. Please try again.", "error"),
  });

  return (
    <button
      type="button"
      aria-pressed={watched}
      aria-label={watched ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      data-testid={`watch-${symbol}`}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAuthenticated) return navigate(`/login?redirect=${encodeURIComponent(`/stock/${symbol}`)}`);
        toggle.mutate();
      }}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border text-sm font-semibold transition",
        compact ? "p-2" : "px-3.5 py-1.5",
        watched ? "border-amber-300 bg-amber-100 text-amber-800" : "border-line bg-surface text-ink-2 hover:text-ink",
      )}
    >
      <Star size={15} className={watched ? "fill-amber-500 text-amber-500" : ""} />
      {!compact && (watched ? "Watching" : "Watch")}
    </button>
  );
}

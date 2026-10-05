// Buy/Sell panel for a stock page: integer quantity, live total, cash or shares available, server-priced
// order via /api/store-purchase. Refreshes portfolio data on success. (Phase 2D pre-trade check goes here.)
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { money } from "../lib/format";
import { useStore } from "../store/useStore";
import { Button, Card, cx } from "./ui";

export default function TradePanel({ symbol, price, cash, owned }: { symbol: string; price: number | null; cash: number | null; owned: number }) {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const toast = useStore((s) => s.toast);
  const client = useQueryClient();
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [qty, setQty] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const quantity = /^\d+$/.test(qty) ? parseInt(qty, 10) : 0;
  const total = quantity && price ? quantity * price : 0;
  const trade = useMutation({
    mutationFn: () => api.portfolio.trade(symbol, side, quantity, price ?? undefined),
    onSuccess: (res) => {
      const t = res.transaction;
      const text = `${side === "BUY" ? "Bought" : "Sold"} ${t.quantity} ${symbol} at ${money(t.price)}. Cash left: ${money(res.newBalance)}.`;
      setMessage({ ok: true, text });
      toast(text, "success", "Order filled");
      setQty("");
      ["portfolio", "holdings", "transactions", "ai-memory"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
    },
    onError: (err: Error) => setMessage({ ok: false, text: err.message }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (quantity > 0) trade.mutate();
  }

  return (
    <Card as="aside" className="lg:sticky lg:top-20">
      <div className="mb-4 flex items-center justify-between">
        <strong className="font-display text-lg text-ink">Trade {symbol}</strong>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">Live price</span>
      </div>
      {!isAuthenticated ? (
        <p className="text-sm text-muted">
          <Link className="font-semibold text-brand-600" to={`/login?redirect=${encodeURIComponent(`/stock/${symbol}`)}`}>Log in</Link> to trade {symbol} with $100,000 in virtual cash.
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface-2 p-1" role="tablist" aria-label="Order side">
            {(["BUY", "SELL"] as const).map((s) => (
              <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)} className={cx("rounded-lg py-2 text-sm font-bold", side === s ? (s === "BUY" ? "bg-brand-600 text-white" : "bg-down text-white") : "text-muted")}>
                {s === "BUY" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          <label className="grid gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            Quantity
            <input data-testid="quantity-input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))} placeholder="Number of shares" className="text-base font-semibold normal-case tracking-normal" />
          </label>
          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between"><dt className="text-muted">Price</dt><dd className="tabular">{money(price)}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Estimated total</dt><dd className="font-semibold tabular" data-testid="order-total">{money(total)}</dd></div>
            <div className="flex justify-between">
              <dt className="text-muted">{side === "BUY" ? "Cash available" : "Shares you own"}</dt>
              <dd className="tabular">{side === "BUY" ? money(cash) : owned}</dd>
            </div>
          </dl>
          <Button type="submit" variant={side === "BUY" ? "primary" : "danger"} disabled={!quantity || trade.isPending || !price}>
            {trade.isPending ? "Placing order…" : `${side === "BUY" ? "Buy" : "Sell"} ${quantity || ""} ${symbol}`.replace("  ", " ")}
          </Button>
          {message && (
            <p role={message.ok ? "status" : "alert"} data-testid={message.ok ? "trade-success" : "trade-error"} className={cx("text-sm", message.ok ? "text-up" : "text-down")}>
              {message.text}
            </p>
          )}
          <p className="text-center text-xs text-muted">Paper trading with virtual cash. Orders fill instantly at the live price.</p>
        </form>
      )}
    </Card>
  );
}

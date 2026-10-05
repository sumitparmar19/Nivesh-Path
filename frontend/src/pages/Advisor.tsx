// AI Portfolio Advisor: analyze the user's holdings (pre-loaded, editable for what-ifs) with a risk profile
// and optional question, show the insight, and keep every analysis in a history the user can reopen/delete.
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, History, Plus, RefreshCw, Trash2, Wand2 } from "lucide-react";
import InsightView from "../components/InsightView";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { dateTime } from "../lib/format";
import { useStore } from "../store/useStore";
import type { AdvisorHolding, AnalysisResult, RiskProfile } from "../types";

export const CHIPS = ["Am I too concentrated?", "What are my biggest risks?", "Should I rebalance?", "Explain my portfolio in simple terms"];

interface Row {
  symbol: string;
  quantity: string;
  avg_price: string;
}

const toRow = (h: AdvisorHolding): Row => ({ symbol: h.symbol, quantity: String(h.quantity), avg_price: String(h.avg_price) });

export default function Advisor() {
  const client = useQueryClient();
  const toast = useStore((s) => s.toast);
  const holdings = useQuery({ queryKey: ["holdings"], queryFn: api.portfolio.holdings });
  const history = useQuery({ queryKey: ["ai-history"], queryFn: api.ai.history });
  const memory = useQuery({ queryKey: ["ai-memory"], queryFn: api.ai.memory });
  const [rows, setRows] = useState<Row[]>([]);
  const [risk, setRisk] = useState<RiskProfile>("moderate");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (holdings.data) setRows(holdings.data.map(toRow));
  }, [holdings.data]);

  const analyze = useMutation({
    mutationFn: (payload: { holdings: AdvisorHolding[]; risk: RiskProfile; question: string }) => api.ai.analyze(payload.holdings, payload.risk, payload.question),
    onSuccess: (data) => {
      setResult(data);
      setActiveId(data.analysisId || null);
      client.invalidateQueries({ queryKey: ["ai-history"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: api.ai.deleteAnalysis,
    onSuccess: (_d, id) => {
      client.invalidateQueries({ queryKey: ["ai-history"] });
      if (id === activeId) {
        setResult(null);
        setActiveId(null);
      }
      toast("Analysis deleted.", "success");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const parsed: AdvisorHolding[] = rows
    .filter((r) => r.symbol.trim())
    .map((r) => ({ symbol: r.symbol.trim().toUpperCase(), quantity: Number(r.quantity), avg_price: Number(r.avg_price) }));
  const valid = parsed.length > 0 && parsed.every((h) => h.quantity > 0 && h.avg_price > 0);

  function submit(e?: FormEvent, chip?: string) {
    e?.preventDefault();
    setError("");
    const q = chip ?? question;
    if (chip) setQuestion(chip);
    if (!valid) {
      setError("Every holding needs a symbol, a quantity and an average price above 0.");
      return;
    }
    analyze.mutate({ holdings: parsed, risk, question: q.trim() });
  }

  async function open(id: string) {
    try {
      const detail = await api.ai.analysis(id);
      setResult(detail.result);
      setActiveId(id);
      setRisk(detail.riskProfile);
      setQuestion(detail.question || "");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't open that analysis.", "error");
    }
  }

  const update = (i: number, key: keyof Row, value: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  const mem = memory.data;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Powered by Claude"
        title="AI Portfolio Advisor"
        lede="A plain-English read on your risk, diversification and next steps, grounded in your own trade history."
        action={mem && (
          <span className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-muted">
            <Brain size={16} className="text-brand-600" />
            {!mem.aiReachable ? "AI memory offline" : mem.tradesInDatabase === 0 ? "No trades to learn from yet" : `Remembers ${mem.indexedTrades ?? 0} of your ${mem.tradesInDatabase} trades`}
          </span>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
        <Card as="div">
          <form onSubmit={submit} noValidate className="grid gap-4">
            <CardHeader
              title="Your holdings"
              action={<Button size="sm" variant="subtle" onClick={() => holdings.refetch().then((r) => r.data && setRows(r.data.map(toRow)))}><RefreshCw size={14} /> Load my holdings</Button>}
            />
            {holdings.isLoading ? <Skeleton className="h-24" /> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted"><tr><th className="pb-1">Symbol</th><th className="pb-1">Qty</th><th className="pb-1">Avg price ($)</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="py-1 pr-1"><input aria-label="Symbol" value={r.symbol} maxLength={10} onChange={(e) => update(i, "symbol", e.target.value)} className="w-full text-sm uppercase" /></td>
                      <td className="py-1 pr-1"><input aria-label="Quantity" type="number" min="0" step="any" value={r.quantity} onChange={(e) => update(i, "quantity", e.target.value)} className="w-full text-sm" /></td>
                      <td className="py-1 pr-1"><input aria-label="Average price" type="number" min="0" step="any" value={r.avg_price} onChange={(e) => update(i, "avg_price", e.target.value)} className="w-full text-sm" /></td>
                      <td><button type="button" aria-label="Remove holding" onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-1 text-muted hover:text-down"><Trash2 size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!holdings.isLoading && rows.length === 0 && <p className="text-sm text-muted">You don&apos;t own any stocks yet. Add a what-if holding below, or buy a stock first.</p>}
            <Button size="sm" variant="ghost" onClick={() => setRows([...rows, { symbol: "", quantity: "", avg_price: "" }])}><Plus size={14} /> Add a what-if holding</Button>

            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
              Risk profile
              <select value={risk} onChange={(e) => setRisk(e.target.value as RiskProfile)}>
                <option value="conservative">Conservative</option>
                <option value="moderate">Moderate</option>
                <option value="aggressive">Aggressive</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
              Ask a question <span className="font-normal text-muted">(optional)</span>
              <textarea rows={3} maxLength={1000} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Am I too concentrated in tech?" />
            </label>
            <div className="flex flex-wrap gap-2">
              {CHIPS.map((c) => (
                <button key={c} type="button" disabled={analyze.isPending || !valid} onClick={() => submit(undefined, c)} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink-2 hover:border-brand-100 hover:text-brand-700 disabled:opacity-50">
                  {c}
                </button>
              ))}
            </div>
            <Button type="submit" disabled={analyze.isPending || !valid}><Wand2 size={16} /> {analyze.isPending ? "Analyzing…" : "Analyze my portfolio"}</Button>
            {error && <p role="alert" className="text-sm text-down">{error}</p>}
          </form>
        </Card>

        <Card aria-live="polite" as="div">
          {analyze.isPending ? (
            <div className="grid gap-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-16" /><Skeleton className="h-24" /><p className="text-sm text-muted">The advisor is reading your portfolio and past trades…</p></div>
          ) : result ? (
            <InsightView data={result} />
          ) : (
            <EmptyState icon={<Wand2 />} title="Your analysis will appear here">Pick a question or press Analyze. Every analysis is saved so you can compare later.</EmptyState>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Past analyses" icon={<History size={18} />} action={<span className="text-sm text-muted">Saved to your account</span>} />
        {history.isLoading ? <Skeleton className="h-12" /> : !history.data?.length ? (
          <p className="text-sm text-muted">No analyses yet. Run one above and it will be saved here.</p>
        ) : (
          <ul className="grid gap-2" aria-label="Past analyses">
            {history.data.map((a) => (
              <li key={a.id} className={cx("flex items-center gap-2 rounded-xl border p-1 pr-2", a.id === activeId ? "border-brand-100 bg-brand-50" : "border-line")}>
                <button type="button" onClick={() => open(a.id)} className="grid flex-1 grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg p-2 text-left text-sm">
                  <Badge tone={a.result.insight?.risk_level === "high" ? "red" : a.result.insight?.risk_level === "medium" ? "amber" : "brand"}>{a.result.insight?.risk_level || "n/a"}</Badge>
                  <span className="truncate text-ink">{a.question || "Full portfolio analysis"}</span>
                  <span className="whitespace-nowrap text-xs text-muted">{dateTime(a.createdAt)}</span>
                </button>
                <button type="button" aria-label="Delete analysis" disabled={remove.isPending} onClick={() => remove.mutate(a.id)} className="rounded-lg p-2 text-muted hover:bg-down/10 hover:text-down"><Trash2 size={15} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

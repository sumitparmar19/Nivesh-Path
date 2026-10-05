// "AI memory" panel: trades saved in MongoDB vs trades the advisor can recall (ChromaDB), with Re-sync.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, Database, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useStore } from "../store/useStore";
import { Badge, Button, Card, CardHeader } from "./ui";

const INDEX_TEXT: Record<string, string> = {
  ok: "Rebuilt from the database when the AI service last started",
  running: "Rebuilding from the database right now…",
  pending: "Waiting to rebuild from the database",
  failed: "Last rebuild failed - the advisor still works, without history",
  disabled: "Database link not configured on the AI service",
};

export default function MemoryPanel() {
  const client = useQueryClient();
  const toast = useStore((s) => s.toast);
  const { data: m } = useQuery({ queryKey: ["ai-memory"], queryFn: api.ai.memory });
  const rebuild = useMutation({
    mutationFn: api.ai.rebuildMemory,
    onSuccess: (data) => {
      client.setQueryData(["ai-memory"], data);
      toast(`The advisor now recalls ${data.indexedTrades ?? 0} of your trades.`, "success", "Memory re-synced");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  const saved = m?.tradesInDatabase ?? 0;
  const indexed = m?.indexedTrades ?? 0;
  const synced = !!m?.aiReachable && (saved === 0 || indexed >= saved);
  const ratio = saved ? Math.min(indexed / saved, 1) : 1;

  return (
    <Card>
      <CardHeader
        title="AI memory"
        icon={<Brain size={18} />}
        action={m ? (m.aiReachable ? <Badge tone={synced ? "brand" : "amber"}>{synced ? "In sync" : "Catching up"}</Badge> : <Badge tone="amber">AI offline</Badge>) : null}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <strong className="block font-display text-2xl tabular text-ink">{m ? saved : "–"}</strong>
          <span className="text-xs text-muted">trades saved in your account</span>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <strong className="block font-display text-2xl tabular text-ink">{m?.aiReachable ? indexed : "–"}</strong>
          <span className="text-xs text-muted">trades the AI can recall</span>
        </div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${m?.aiReachable ? Math.round(ratio * 100) : 0}%` }} />
      </div>
      <p className="mt-3 text-sm text-muted">
        {!m ? "Checking…" : !m.aiReachable ? "The AI service isn't reachable right now. Your trades are safe and will be re-indexed." : saved === 0 ? "Once you trade, each order is saved and indexed so the advisor can cite it." : synced ? `The advisor can recall all ${saved} of your trades. They live in the database, so this memory survives every site update.` : `The advisor recalls ${indexed} of ${saved} trades. It catches up the next time you ask it something, or re-sync now.`}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted"><Database size={13} /> {m?.index ? INDEX_TEXT[m.index.status] : ""}</span>
        <Button size="sm" variant="ghost" disabled={!m?.durableStorage || rebuild.isPending} onClick={() => rebuild.mutate()}>
          <RefreshCw size={14} className={rebuild.isPending ? "animate-spin" : ""} /> {rebuild.isPending ? "Re-syncing…" : "Re-sync memory"}
        </Button>
      </div>
    </Card>
  );
}

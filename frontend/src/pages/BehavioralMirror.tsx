// Behavioral Mirror (/behavioral-mirror): the user's own trading habits. Scores and pattern counts computed by
// the server from their trades, an AI coach that explains them with their own numbers, and the list of
// detected panic sells, FOMO buys and overconcentration warnings (filter, mark read, dismiss).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, CheckCheck, RefreshCw, Sparkles } from "lucide-react";
import { PATTERN_META, PatternCard } from "../components/PatternCard";
import { Badge, Button, ButtonLink, Card, CardHeader, EmptyState, ErrorState, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { dateTime } from "../lib/format";
import { useStore } from "../store/useStore";
import type { BehaviorInsight, PatternSummary, PatternType } from "../types";

type Filter = "all" | PatternType;
const TYPES: PatternType[] = ["panic_sell", "fomo_buy", "overconcentration"];
const KEYS = { patterns: ["patterns"], summary: ["pattern-summary"], insight: ["behavior-insight"] } as const;

/** A labelled 0-100 meter. Value text uses ink colours; the bar carries the magnitude. */
function Meter({ label, value, help, empty }: { label: string; value: number | null; help: string; empty: string }) {
  return (
    <div className="grid gap-2 rounded-2xl border border-line bg-surface-2/50 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
        <strong className="whitespace-nowrap font-display text-2xl font-bold tabular-nums text-ink" data-testid={`score-${label}`}>
          {value === null ? "–" : value}
          {value !== null && <span className="text-sm font-semibold text-muted"> / 100</span>}
        </strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
        {value !== null && <div className="h-full rounded-full bg-brand-600" style={{ width: `${value}%` }} />}
      </div>
      <p className="text-xs text-muted">{value === null ? empty : help}</p>
    </div>
  );
}

function Scores({ s }: { s: PatternSummary }) {
  const sc = s.scores;
  return (
    <Card>
      <CardHeader title="Your trading habits" icon={<Brain size={18} />} />
      <div className="grid gap-3">
        <Meter
          label="Impulse control"
          value={sc.impulseControl}
          help={`${sc.checkedTrades - sc.flaggedTrades} of your ${sc.checkedTrades} checked trades had no panic or FOMO flag.${sc.tradeCount > sc.checkedTrades ? ` ${sc.tradeCount - sc.checkedTrades} older trade(s) weren't checked and don't count.` : ""}`}
          empty={`Needs 3 checked trades (you have ${sc.checkedTrades}).`}
        />
        <Meter
          label="Diversification"
          value={sc.diversification}
          help={s.largestPosition ? `Your largest position, ${s.largestPosition.symbol}, is ${s.largestPosition.percent}% of your account (cash included).` : "No stock positions yet: your account is all cash."}
          empty=""
        />
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {TYPES.map((t) => {
          const Icon = PATTERN_META[t].icon;
          return (
            <div key={t} className="min-w-0 rounded-xl border border-line p-2 sm:p-3">
              <dt className="flex flex-wrap items-center justify-center gap-1 text-[11px] font-semibold text-muted [overflow-wrap:anywhere] sm:text-xs"><Icon size={14} aria-hidden /> {PATTERN_META[t].label}</dt>
              <dd className="font-display text-xl font-bold tabular-nums text-ink" data-testid={`count-${t}`}>{s.byType[t]}</dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

function Coach({ hasPatterns, tradeCount }: { hasPatterns: boolean; tradeCount: number }) {
  const client = useQueryClient();
  const saved = useQuery({ queryKey: KEYS.insight, queryFn: api.patterns.insight });
  const analyze = useMutation({
    mutationFn: api.patterns.analyze,
    onSuccess: (data) => client.setQueryData(KEYS.insight, data),
  });
  const insight = saved.data && saved.data.insight ? (saved.data as BehaviorInsight) : null;

  return (
    <Card>
      <CardHeader
        title="AI coach"
        icon={<Sparkles size={18} />}
        action={tradeCount > 0 && (
          <Button size="sm" variant={insight ? "ghost" : "primary"} disabled={analyze.isPending} onClick={() => analyze.mutate()}>
            {insight ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {analyze.isPending ? "Analyzing…" : insight ? "Refresh" : "Get my insight"}
          </Button>
        )}
      />
      {analyze.isError && <ErrorState message={(analyze.error as Error).message} onRetry={() => analyze.mutate()} />}
      {insight?.stale && !analyze.isPending && (
        <p role="status" data-testid="coach-stale" className="mb-3 rounded-xl border border-warn/40 bg-amber-500/10 p-3 text-sm text-ink-2">
          Your patterns changed since this insight. <button type="button" className="font-semibold text-brand-600 hover:underline" onClick={() => analyze.mutate()}>Refresh it</button>
        </p>
      )}
      {saved.isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : insight ? (
        <div data-testid="coach-insight" className="grid gap-2">
          <h3 className="font-display text-lg font-bold text-ink">{insight.headline}</h3>
          <p className="text-ink-2">{insight.insight}</p>
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-700"><strong>Try this:</strong> {insight.suggestion}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Badge tone={insight.ai_generated ? "brand" : "muted"}>{insight.ai_generated ? "AI insight" : "Rule-based insight"}</Badge>
            {dateTime(insight.created_at)} · Educational, not financial advice.
          </p>
        </div>
      ) : (
        <p className="text-muted">
          {tradeCount === 0
            ? "Make a few trades and the coach will explain your habits using your own trades."
            : hasPatterns
              ? "Get a short, personal explanation of your habits, with one thing to try on your next trade."
              : "No risky habits found so far. You can still ask the coach for a check-up."}
        </p>
      )}
    </Card>
  );
}

export default function BehavioralMirror() {
  const client = useQueryClient();
  const toast = useStore((s) => s.toast);
  const [filter, setFilter] = useState<Filter>("all");
  const summary = useQuery({ queryKey: KEYS.summary, queryFn: api.patterns.summary });
  const patterns = useQuery({ queryKey: KEYS.patterns, queryFn: () => api.patterns.list({ limit: 100 }) });

  const refresh = () => {
    client.invalidateQueries({ queryKey: KEYS.patterns });
    client.invalidateQueries({ queryKey: KEYS.summary });
  };
  const acknowledge = useMutation({ mutationFn: api.patterns.acknowledge, onSuccess: refresh, onError: (e: Error) => toast(e.message, "error") });
  const acknowledgeAll = useMutation({ mutationFn: api.patterns.acknowledgeAll, onSuccess: refresh, onError: (e: Error) => toast(e.message, "error") });
  const dismiss = useMutation({
    mutationFn: api.patterns.remove,
    onSuccess: () => { refresh(); toast("Pattern dismissed.", "success"); },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const all = patterns.data?.patterns ?? [];
  const shown = filter === "all" ? all : all.filter((p) => p.patternType === filter);
  const unread = all.filter((p) => !p.acknowledged).length;
  const read = all.length - unread;
  const busy = acknowledge.isPending || dismiss.isPending || acknowledgeAll.isPending;

  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Your trading DNA"
        title="Behavioral Mirror"
        lede="Most investors lose money through habits, not lack of information. These are the habits found in your own trades."
      />

      {summary.isError ? (
        <ErrorState message={(summary.error as Error).message} onRetry={() => summary.refetch()} />
      ) : summary.data ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Scores s={summary.data} />
          <Coach hasPatterns={summary.data.totalPatterns > 0} tradeCount={summary.data.scores.tradeCount} />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      )}

      <Card>
        <CardHeader
          title="Detected patterns"
          action={unread > 0 && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => acknowledgeAll.mutate()}>
              <CheckCheck size={14} /> Mark all read
            </Button>
          )}
        />
        {all.length > 0 && (
          <p className="-mt-2 mb-3 text-sm text-muted" data-testid="read-counts">{unread} new · {read} read</p>
        )}
        <div role="tablist" aria-label="Filter patterns" className="mb-4 flex flex-wrap gap-2">
          {(["all", ...TYPES] as Filter[]).map((f) => {
            const count = f === "all" ? all.length : all.filter((p) => p.patternType === f).length;
            return (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={cx("rounded-full border px-3 py-1.5 text-xs font-semibold transition", filter === f ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-2 hover:bg-surface-2")}
              >
                {f === "all" ? "All" : PATTERN_META[f].label} ({count})
              </button>
            );
          })}
        </div>

        {patterns.isError ? (
          <ErrorState message={(patterns.error as Error).message} onRetry={() => patterns.refetch()} />
        ) : patterns.isLoading ? (
          <div className="grid gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        ) : shown.length === 0 ? (
          <EmptyState
            icon={<Brain />}
            title={filter === "all" ? "No patterns detected" : `No ${PATTERN_META[filter].label.toLowerCase()} patterns`}
            action={filter === "all" && <ButtonLink to="/markets" variant="ghost">Find a stock to trade</ButtonLink>}
          >
            {filter === "all" ? "Nothing risky in your trades so far. Every new trade is checked automatically." : "None of this type yet."}
          </EmptyState>
        ) : (
          <div className="grid gap-3">
            {shown.map((p) => (
              <PatternCard key={p._id} pattern={p} busy={busy} onAcknowledge={(id) => acknowledge.mutate(id)} onDismiss={(id) => dismiss.mutate(id)} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="How patterns are detected" />
        <ul className="grid gap-3 sm:grid-cols-3">
          {TYPES.map((t) => {
            const Icon = PATTERN_META[t].icon;
            return (
              <li key={t} className="grid gap-1 text-sm">
                <span className="flex items-center gap-2 font-semibold text-ink"><Icon size={15} aria-hidden /> {PATTERN_META[t].label}</span>
                <span className="text-muted">{PATTERN_META[t].what}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Each trade is checked when you make it, using that moment's price data. Trades from before this feature launched
          aren't checked for panic or FOMO, because the market situation at the time wasn't recorded. Educational, not financial advice.
        </p>
      </Card>
    </div>
  );
}

// What's new: live system status (GET /api/status, every 30s), release notes with "try it" links, roadmap.
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Gift, HeartPulse } from "lucide-react";
import { Badge, ButtonLink, Card, CardHeader } from "../components/ui";
import { RELEASES, ROADMAP } from "../config/releases";
import { api } from "../lib/api";
import type { SystemStatus } from "../types";

type Dot = "ok" | "warn" | "bad";
const DOT: Record<Dot, string> = { ok: "bg-brand-600", warn: "bg-warn", bad: "bg-down" };

function rows(s: SystemStatus | undefined): [string, string, Dot][] {
  if (!s) return [];
  const ai = s.ai;
  const idx = ai.vectorIndex;
  const indexText: Record<string, [string, Dot]> = {
    ok: [`Done · ${idx?.transactions ?? 0} trades for ${idx?.users ?? 0} users in ${(idx?.seconds ?? 0).toFixed(1)}s`, "ok"],
    running: ["Rebuilding now…", "warn"],
    pending: ["Starting…", "warn"],
    failed: ["Failed - advisor runs without history", "bad"],
    disabled: ["Not configured (no database link)", "warn"],
  };
  return [
    ["Web app", "Online", "ok"],
    ["Database (MongoDB Atlas)", s.db === "connected" ? "Connected" : "Disconnected", s.db === "connected" ? "ok" : "bad"],
    ["AI service", ai.reachable ? "Online" : "Offline", ai.reachable ? "ok" : "bad"],
    ["Claude AI model", ai.reachable ? (ai.llmConfigured ? ai.model || "Configured" : "Rule-based fallback") : "Unavailable", ai.reachable ? (ai.llmConfigured ? "ok" : "warn") : "bad"],
    ["AI memory rebuild", ai.reachable && idx ? indexText[idx.status][0] : "Unavailable", ai.reachable && idx ? indexText[idx.status][1] : "bad"],
  ];
}

export default function WhatsNew() {
  const status = useQuery({ queryKey: ["status"], queryFn: api.status, refetchInterval: 30_000 });
  const list = rows(status.data);
  const healthy = list.length > 0 && list.every((r) => r[2] === "ok");
  return (
    <div className="grid gap-6">
      <section className="relative overflow-hidden rounded-3xl bg-[radial-gradient(120%_140%_at_100%_0%,#22c55e_0%,#15803d_45%,#0f3d24_100%)] p-8 text-white shadow-lift">
        <p className="text-xs font-bold uppercase tracking-widest text-green-200"><Gift size={14} className="mr-1 inline" /> Release notes</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">What&apos;s new in Nivesh-Path</h1>
        <p className="mt-2 max-w-2xl text-white/85">Nivesh-Path is becoming the AI that knows <b>your</b> trading habits. Everything shipped so far, newest first.</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Live system status" icon={<HeartPulse size={18} />} action={status.data ? <Badge tone={healthy ? "brand" : "amber"}>{healthy ? "All systems go" : "Partly degraded"}</Badge> : status.isError ? <Badge tone="red">Unreachable</Badge> : null} />
          <ul className="divide-y divide-dashed divide-line text-sm" data-testid="status-list">
            {list.map(([label, text, dot]) => (
              <li key={label} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-ink-2">{label}</span>
                <b className="flex items-center gap-2 text-right text-ink"><span className={`h-2 w-2 rounded-full ${DOT[dot]}`} />{text}</b>
              </li>
            ))}
            {!status.data && <li className="py-2.5 text-muted">{status.isError ? "The status service is unreachable." : "Checking…"}</li>}
          </ul>
          {status.data && <p className="mt-2 text-xs text-muted">Checked {new Date(status.data.checkedAt).toLocaleTimeString()} · refreshes every 30 seconds</p>}
        </Card>
        <Card>
          <CardHeader title="Under the hood" />
          <div className="flex flex-wrap gap-2">
            {["React 18 + TypeScript", "Tailwind CSS", "TanStack Query", "Node.js 22 + Express", "MongoDB Atlas", "Python FastAPI", "Claude API", "LangChain", "ChromaDB (RAG)", "Redis", "Docker", "GitHub Actions CI", "DigitalOcean", "Vitest + Jest + pytest + Playwright"].map((c) => (
              <span key={c} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-ink-2">{c}</span>
            ))}
          </div>
        </Card>
      </div>

      <ol className="relative grid gap-5 border-l-2 border-line pl-6">
        {RELEASES.map((r) => (
          <li key={r.title} className="relative">
            <span className="absolute -left-[33px] top-6 h-4 w-4 rounded-full border-[3px] border-brand-600 bg-surface" />
            <Card as="article">
              <div className="mb-2 flex flex-wrap gap-2">{r.isNew && <Badge>New</Badge>}<Badge tone="muted">{r.tag}</Badge></div>
              <h2 className="font-display text-lg font-bold text-ink">{r.title}</h2>
              <p className="mt-1 text-muted">{r.intro}</p>
              <ul className="mt-3 grid gap-2 text-sm text-ink-2">
                {r.points.map(([b, t]) => <li key={b} className="flex gap-2"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600" /><span><b>{b}</b> {t}</span></li>)}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">{r.links.map((l, i) => <ButtonLink key={l.to} to={l.to} variant={i ? "ghost" : "primary"} className="px-3 py-1.5">{l.label}</ButtonLink>)}</div>
            </Card>
          </li>
        ))}
        <li className="relative">
          <span className="absolute -left-[33px] top-6 h-4 w-4 rounded-full border-[3px] border-line bg-surface" />
          <Card as="article">
            <Badge tone="amber">Coming next</Badge>
            <h2 className="mt-2 font-display text-lg font-bold text-ink">On the roadmap</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ROADMAP.map(([tag, title, text]) => (
                <div key={tag} className="rounded-xl border border-dashed border-line bg-surface-2 p-4">
                  <Badge tone="muted">{tag}</Badge>
                  <strong className="mt-2 block text-ink">{title}</strong>
                  <span className="text-sm text-muted">{text}</span>
                </div>
              ))}
            </div>
          </Card>
        </li>
      </ol>
      <p className="text-center text-sm text-muted">Nivesh-Path is a paper-trading and learning tool. Insights are educational, not financial advice.</p>
    </div>
  );
}

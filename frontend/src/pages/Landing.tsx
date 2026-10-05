// Landing page for visitors: what Nivesh-Path is, a live price strip, the three real features, how it
// works. Logged-in users go straight to their portfolio.
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Fingerprint, PiggyBank, Wand2 } from "lucide-react";
import { ButtonLink, Card, cx } from "../components/ui";
import { FEATURED, stockPath } from "../config/site";
import { api } from "../lib/api";
import { money, pct, tone } from "../lib/format";
import { useStore } from "../store/useStore";

const FEATURES = [
  { icon: PiggyBank, title: "Paper trading with $100,000", text: "Buy and sell 50+ popular US stocks and ETFs, or any NYSE/NASDAQ ticker, at the live price. No real money, no risk.", to: "/markets", cta: "Open Markets" },
  { icon: Wand2, title: "An AI advisor that cites your trades", text: "Ask about risk and diversification. The advisor looks up your own past trades before answering, and saves every analysis.", to: "/advisor", cta: "Try the advisor" },
  { icon: Fingerprint, title: "Your trading DNA (coming next)", text: "Most losses come from habits like panic selling and FOMO buying. Nivesh-Path is learning to spot them in your own history.", to: "/whats-new", cta: "See the roadmap" },
];

export default function Landing() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const popular = useQuery({ queryKey: ["popular"], queryFn: api.stocks.popular, refetchInterval: 60_000, enabled: !isAuthenticated });
  if (isAuthenticated) return <Navigate to="/portfolio" replace />;
  const strip = FEATURED.filter((s) => popular.data?.[s.symbol]).slice(0, 8);

  return (
    <div className="grid gap-12">
      <section className="grid justify-items-center gap-5 pt-6 text-center">
        <Link to="/whats-new" className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 py-1 pl-1 pr-3 text-sm font-semibold text-brand-700">
          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase text-white">New</span> Rebuilt in React · a page for every stock <ArrowRight size={14} />
        </Link>
        <h1 className="max-w-3xl font-display text-4xl font-extrabold leading-tight text-ink sm:text-5xl">Trade smarter. Know your patterns.</h1>
        <p className="max-w-2xl text-lg text-muted">Practice with $100,000 in virtual cash, trade US stocks at live prices, and get AI coaching grounded in your own trades.</p>
        <div className="flex flex-wrap justify-center gap-3">
          <ButtonLink to="/register" className="px-6 py-3 text-base">Start with $100,000 - sign up free</ButtonLink>
          <ButtonLink to="/markets" variant="ghost" className="px-6 py-3 text-base">Browse markets</ButtonLink>
        </div>
        <p className="text-sm text-muted">Already have an account? <Link to="/login" className="font-semibold text-brand-600">Log in</Link></p>
      </section>

      {strip.length > 0 && (
        <section aria-label="Live prices" className="flex gap-2 overflow-x-auto pb-2" data-testid="price-strip">
          {strip.map((s) => {
            const q = popular.data?.[s.symbol];
            return (
              <Link key={s.symbol} to={stockPath(s.symbol)} className="inline-flex shrink-0 items-baseline gap-2 rounded-full border border-line bg-surface px-4 py-2 tabular hover:border-brand-100">
                <strong>{s.symbol}</strong><span>{money(q?.c)}</span><small className={cx("font-semibold", tone(q?.dp))}>{pct(q?.dp)}</small>
              </Link>
            );
          })}
        </section>
      )}

      <section className="grid gap-5 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, text, to, cta }) => (
          <Card key={title} as="article" className="grid content-start gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Icon size={22} /></span>
            <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
            <p className="text-sm leading-relaxed text-muted">{text}</p>
            <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600">{cta} <ArrowRight size={14} /></Link>
          </Card>
        ))}
      </section>

      <Card>
        <h2 className="font-display text-2xl font-bold text-ink">How it works</h2>
        <ol className="mt-4 grid gap-4 md:grid-cols-3">
          {[["Sign up free", "You start with $100,000 of virtual cash."], ["Pick stocks and trade", "Orders fill at the live price; you can't overspend or oversell."], ["Learn from your own behavior", "Track your portfolio, keep a watchlist and ask the AI what your trades say about you."]].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-600 font-bold text-white">{i + 1}</span>
              <span><strong className="block text-ink">{t}</strong><span className="text-sm text-muted">{d}</span></span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm text-muted">Educational, not financial advice. Prices from Finnhub. <Link className="font-semibold text-brand-600" to="/about#faq">Read the FAQ</Link></p>
      </Card>
    </div>
  );
}

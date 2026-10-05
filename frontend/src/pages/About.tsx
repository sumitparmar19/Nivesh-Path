// About & FAQ: who built Nivesh-Path and why, the tech stack, and answers to first questions.
import { Mail } from "lucide-react";
import { GithubIcon as Github, LinkedinIcon as Linkedin } from "../components/BrandIcons";
import { ButtonLink, Card } from "../components/ui";
import { OWNER } from "../config/site";

export const FAQ: [string, string][] = [
  ["Is this real money?", "No. Every account starts with $100,000 of virtual cash. Trades are simulated at the live market price, so you can practice without any risk. You can reset to $100,000 any time from Account."],
  ["Where do prices come from?", "Quotes, company profiles, key stats and news come from Finnhub, fetched by our server and cached for about a minute. Charts are embedded from TradingView when our own price history isn't available."],
  ["Is this financial advice?", "No. Nivesh-Path is an educational project. The AI advisor explains your portfolio and your habits; it does not tell you what to buy with real money."],
  ["How many stocks can I trade?", "50+ popular US stocks and ETFs are listed on Markets, and you can search and trade any ticker listed on NYSE or NASDAQ."],
  ["Is it free?", "Yes, completely. There are no plans, fees or payments."],
];

export default function About() {
  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <section className="rounded-3xl bg-[radial-gradient(120%_140%_at_100%_0%,#22c55e_0%,#15803d_45%,#0f3d24_100%)] p-8 text-white shadow-lift">
        <p className="text-xs font-bold uppercase tracking-widest text-green-200">About</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">Nivesh-Path: the AI that knows your trading habits</h1>
        <p className="mt-2 text-white/85">A project by <strong>{OWNER.name}</strong>, {OWNER.title}.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <a href={OWNER.github} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700"><Github size={16} /> GitHub</a>
          <a href={OWNER.linkedin} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/50 px-4 py-2 text-sm font-semibold text-white"><Linkedin size={16} /> LinkedIn</a>
          <ButtonLink to="/contact" variant="ghost" className="border-white/50 bg-transparent px-4 py-2 text-white hover:bg-white/10"><Mail size={16} /> Contact</ButtonLink>
        </div>
      </section>

      <Card>
        <h2 className="font-display text-xl font-bold text-ink">Why it exists</h2>
        <p className="mt-2 leading-relaxed text-ink-2">
          Most new investors don&apos;t lose money for lack of information. They lose it to habits: selling in a panic after a drop, buying after a stock has already run up, putting everything into one name. Nivesh-Path lets you practice with $100,000 of virtual cash, keeps every trade you make, and uses AI to show you what your own history says about how you invest.
        </p>
      </Card>

      <Card>
        <h2 className="font-display text-xl font-bold text-ink">How it&apos;s built</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {["React 18 + TypeScript", "Tailwind CSS", "Node.js 22 + Express", "MongoDB Atlas", "JWT + bcrypt", "Python FastAPI", "Claude API", "LangChain", "ChromaDB (RAG)", "Redis", "Finnhub market data", "Docker", "GitHub Actions CI", "DigitalOcean"].map((c) => (
            <span key={c} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-semibold text-ink-2">{c}</span>
          ))}
        </div>
        <p className="mt-3 text-sm text-muted">Every change runs automated tests (Vitest, Jest, pytest and a Playwright smoke test) before it reaches the live site.</p>
      </Card>

      <Card>
        <h2 id="faq" className="font-display text-xl font-bold text-ink">FAQ</h2>
        <div className="mt-2 divide-y divide-line">
          {FAQ.map(([q, a], i) => (
            <details key={q} open={i === 0} className="group py-3">
              <summary className="cursor-pointer font-semibold text-ink">{q}</summary>
              <p className="mt-2 leading-relaxed text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}

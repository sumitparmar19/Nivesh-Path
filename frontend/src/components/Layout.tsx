// Shared page frame ported from the legacy nivesh.js layout: top bar, sidebar (logged-in pages) and footer.
// AppLayout wraps the signed-in pages; PublicLayout wraps landing/about/contact (no sidebar).
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Brain, Briefcase, Gift, LineChart, LogOut, Menu, Moon, Receipt, Star, Sun, UserCircle, Wand2, X } from "lucide-react";
import { useStore } from "../store/useStore";
import { api } from "../lib/api";
import { OWNER } from "../config/site";
import { initials } from "../lib/format";
import { cx } from "./ui";

export const SIDEBAR = [
  { to: "/markets", label: "Markets", icon: LineChart },
  { to: "/portfolio", label: "Portfolio", icon: Briefcase },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/advisor", label: "AI Advisor", icon: Wand2 },
  { to: "/behavioral-mirror", label: "Behavioral Mirror", icon: Brain },
  { to: "/watchlist", label: "Watchlist", icon: Star },
  { to: "/whats-new", label: "What's new", icon: Gift },
  { to: "/account", label: "Account", icon: UserCircle },
] as const;

const TOPNAV = [
  { to: "/markets", label: "Markets" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/advisor", label: "AI Advisor" },
  { to: "/whats-new", label: "What's new" },
  { to: "/about", label: "About" },
] as const;

function ThemeToggle() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => {
        setTheme(next);
        if (isAuthenticated) api.me.updateSettings({ theme: next }).catch(() => undefined); // saved to the account
      }}
      className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition hover:text-ink"
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

function TopBar({ withMenu }: { withMenu?: boolean }) {
  const { isAuthenticated, user, logout } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={isAuthenticated ? "/portfolio" : "/"} className="flex items-center gap-2" aria-label="Nivesh-Path home">
          <img src="/logo.png" alt="" className="h-10 w-auto" />
          <span className="hidden font-display text-lg font-extrabold text-ink sm:inline">Nivesh-Path</span>
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {TOPNAV.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) => cx("rounded-full px-3 py-1.5 text-sm font-medium transition", isActive ? "bg-brand-50 text-brand-700" : "text-ink-2 hover:text-ink")}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isAuthenticated ? (
            <>
              <Link to="/account" title={user?.name || "Account"} aria-label="Your account" className="grid h-9 w-9 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                {initials(user?.name || user?.email)}
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="hidden items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:text-down sm:inline-flex"
              >
                <LogOut size={15} /> Log out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-2 hover:text-ink">Log in</Link>
              <Link to="/register" className="rounded-xl bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">Sign up</Link>
            </>
          )}
          {withMenu === false && (
            <button type="button" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)} className="grid h-9 w-9 place-items-center rounded-full border border-line lg:hidden">
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          )}
        </div>
      </div>
      {open && withMenu === false && (
        <nav aria-label="Mobile" className="grid gap-1 border-t border-line px-4 py-3 lg:hidden">
          {TOPNAV.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-ink-2 hover:bg-surface-2">
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

function Sidebar() {
  // Unread Behavioral Mirror patterns show as a dot on its menu item (signed-in users only).
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const summary = useQuery({ queryKey: ["pattern-summary"], queryFn: api.patterns.summary, enabled: isAuthenticated, staleTime: 60_000 });
  const unread = isAuthenticated ? summary.data?.unreadCount ?? 0 : 0;
  return (
    <nav aria-label="App" className="border-b border-line bg-surface md:sticky md:top-16 md:h-[calc(100vh-4rem)] md:w-60 md:shrink-0 md:border-b-0 md:border-r">
      <ul className="flex gap-2 overflow-x-auto px-4 py-2 md:grid md:gap-1 md:overflow-visible md:px-3 md:py-5">
        {SIDEBAR.map(({ to, label, icon: Icon }) => (
          <li key={to} className="shrink-0">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cx(
                  "relative flex items-center gap-3 rounded-full border px-3.5 py-2 text-sm font-medium transition md:rounded-xl md:border-0",
                  isActive ? "border-brand-100 bg-brand-50 text-brand-700 md:shadow-[inset_3px_0_0_#16a34a]" : "border-line text-ink-2 hover:bg-surface-2 hover:text-ink",
                )
              }
            >
              <Icon size={17} className="shrink-0" />
              {label}
              {to === "/behavioral-mirror" && unread > 0 && (
                <span data-testid="patterns-unread" className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-down px-1.5 text-[11px] font-bold text-white">
                  {unread}
                  <span className="sr-only"> new patterns</span>
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer() {
  return (
    <footer className="mt-10 rounded-2xl border border-line bg-surface px-6 py-8 text-ink-2">
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <img src="/logo.png" alt="Nivesh-Path" className="h-11 w-auto" />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Paper-trade US stocks with $100,000 of virtual cash and an AI coach that learns from your own trades.
          </p>
        </div>
        <nav aria-label="Product" className="grid content-start gap-1 text-sm">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-ink">Product</h4>
          <Link className="text-muted hover:text-brand-600" to="/markets">Markets</Link>
          <Link className="text-muted hover:text-brand-600" to="/portfolio">Portfolio</Link>
          <Link className="text-muted hover:text-brand-600" to="/transactions">Transactions</Link>
          <Link className="text-muted hover:text-brand-600" to="/advisor">AI Advisor</Link>
          <Link className="text-muted hover:text-brand-600" to="/watchlist">Watchlist</Link>
          <Link className="text-muted hover:text-brand-600" to="/whats-new">What&apos;s new</Link>
        </nav>
        <nav aria-label="Project" className="grid content-start gap-1 text-sm">
          <h4 className="mb-1 text-xs font-bold uppercase tracking-widest text-ink">Project</h4>
          <Link className="text-muted hover:text-brand-600" to="/about">About &amp; FAQ</Link>
          <Link className="text-muted hover:text-brand-600" to="/contact">Contact</Link>
          <a className="text-muted hover:text-brand-600" href={OWNER.github} target="_blank" rel="noopener noreferrer">GitHub</a>
          <a className="text-muted hover:text-brand-600" href={OWNER.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-5xl border-t border-line pt-4 text-center text-sm text-muted">
        &copy; {new Date().getFullYear()} Nivesh-Path · A project by {OWNER.name} · Educational, not financial advice
      </p>
    </footer>
  );
}

export function AppLayout() {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar />
      <div className="md:flex">
        <Sidebar />
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
          <Footer />
        </main>
      </div>
    </div>
  );
}

export function PublicLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-bg text-ink">
      <TopBar withMenu={false} />
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children ?? <Outlet />}
        <Footer />
      </main>
    </div>
  );
}

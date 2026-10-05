// Centered card used by the Login and Sign-up pages.
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export default function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-[radial-gradient(60%_50%_at_50%_0%,rgba(34,197,94,.18),transparent_70%)] bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 shadow-lift">
        <Link to="/" className="mx-auto mb-4 block w-fit" aria-label="Nivesh-Path home">
          <img src="/logo.png" alt="Nivesh-Path" className="h-14 w-auto" />
        </Link>
        <h1 className="text-center font-display text-2xl font-extrabold text-ink">{title}</h1>
        <p className="mt-1 text-center text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <div className="mt-6 text-center text-sm text-muted">{footer}</div>
        <p className="mt-4 text-center text-xs text-muted">Paper trading with virtual cash · Educational, not financial advice</p>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
      {label}
      {children}
    </label>
  );
}

// Small shared UI building blocks (cards, buttons, stats, badges, empty/error states, skeletons) so every
// page looks the same and stays consistent in light and dark mode.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link } from "react-router-dom";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Card({ children, className, as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" | "aside" }) {
  return <Tag className={cx("rounded-2xl border border-line bg-surface p-5 shadow-card", className)}>{children}</Tag>;
}

export function CardHeader({ title, icon, action }: { title: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
        {icon && <span className="text-brand-600">{icon}</span>}
        {title}
      </h2>
      {action}
    </div>
  );
}

type Variant = "primary" | "ghost" | "danger" | "subtle";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-600 text-white shadow-[0_8px_20px_rgba(22,163,74,.25)] hover:bg-brand-700",
  ghost: "border border-line bg-surface text-ink hover:bg-surface-2",
  danger: "bg-down text-white hover:opacity-90",
  subtle: "bg-brand-50 text-brand-700 hover:bg-brand-100",
};

export function Button({ variant = "primary", size = "md", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2.5 text-sm",
        VARIANTS[variant],
        className,
      )}
    />
  );
}

export function ButtonLink({ to, children, variant = "primary", className }: { to: string; children: ReactNode; variant?: Variant; className?: string }) {
  return (
    <Link to={to} className={cx("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition", VARIANTS[variant], className)}>
      {children}
    </Link>
  );
}

export function PageHeader({ eyebrow, title, lede, action }: { eyebrow?: string; title: string; lede?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-xs font-bold uppercase tracking-widest text-brand-600">{eyebrow}</p>}
        <h1 className="mt-1 font-display text-2xl font-extrabold text-ink sm:text-3xl">{title}</h1>
        {lede && <p className="mt-1 max-w-2xl text-muted">{lede}</p>}
      </div>
      {action}
    </header>
  );
}

export function Stat({ label, value, foot, highlight, valueClass, testId }: { label: string; value: ReactNode; foot?: ReactNode; highlight?: boolean; valueClass?: string; testId?: string }) {
  return (
    <div className={cx("grid gap-1 rounded-2xl border p-5 shadow-card", highlight ? "border-transparent bg-gradient-to-br from-brand-700 to-brand-500 text-white" : "border-line bg-surface")}>
      <span className={cx("text-xs font-semibold uppercase tracking-wide", highlight ? "text-white/80" : "text-muted")}>{label}</span>
      <strong data-testid={testId} className={cx("font-display text-2xl font-bold tabular-nums", highlight ? "text-white" : valueClass || "text-ink")}>{value}</strong>
      {foot && <span className={cx("text-xs", highlight ? "text-white/80" : "text-muted")}>{foot}</span>}
    </div>
  );
}

export function Badge({ children, tone = "brand" }: { children: ReactNode; tone?: "brand" | "red" | "amber" | "muted" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-700",
    red: "bg-down/10 text-down",
    amber: "bg-amber-500/10 text-warn",
    muted: "border border-line bg-surface-2 text-muted",
  } as const;
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold", tones[tone])}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block animate-pulse rounded-md bg-line", className)} />;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center p-8 text-muted">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-3xl text-brand-600">{icon}</div>}
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      {children && <p className="max-w-md text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-down/30 bg-down/5 p-4 text-sm text-down">
      <span>{message}</span>
      {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function StockLogo({ src, symbol, size = "md" }: { src?: string | null; symbol: string; size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-10 w-10 rounded-xl";
  if (!src) {
    return <span className={cx(box, "grid shrink-0 place-items-center bg-brand-50 text-[0.65rem] font-extrabold text-brand-700")}>{symbol.slice(0, 4)}</span>;
  }
  return (
    <span className={cx(box, "grid shrink-0 place-items-center overflow-hidden border border-line bg-white")}>
      <img src={src} alt="" className="max-h-[70%] max-w-[70%] object-contain" />
    </span>
  );
}

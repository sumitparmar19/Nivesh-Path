// Number and date formatting used across pages (USD, signed amounts, percentages, big numbers).

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const money = (n: number | null | undefined): string => (n == null || Number.isNaN(n) ? "—" : usd.format(n));

export const signedMoney = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : n < 0 ? "-" : ""}${usd.format(Math.abs(n))}`;

export const pct = (n: number | null | undefined, digits = 2): string =>
  n == null || Number.isNaN(n) ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(digits)}%`;

export const num = (n: number | null | undefined, digits = 2): string =>
  n == null || Number.isNaN(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits });

/** Market cap given in millions of USD -> "$3.50T" / "$480.00B" / "$950M". */
export function bigMoney(millions: number | null | undefined): string {
  if (millions == null || Number.isNaN(millions)) return "—";
  const v = millions * 1e6;
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  return `$${(v / 1e6).toFixed(0)}M`;
}

export const tone = (n: number | null | undefined): string => (n == null || n === 0 ? "text-ink-2" : n > 0 ? "text-up" : "text-down");

export const dateTime = (iso: string | number): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

export const shortDate = (iso: string | number): string =>
  new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function timeAgo(unixSeconds: number | null): string {
  if (!unixSeconds) return "";
  const mins = Math.round((Date.now() / 1000 - unixSeconds) / 60);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export const initials = (name?: string | null): string => {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return ((parts[0][0] || "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

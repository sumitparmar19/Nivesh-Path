// CSV export of trades (quoted fields, ISO dates) and a browser download helper.
import type { Trade } from "../types";

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function tradesToCsv(trades: Trade[]): string {
  const header = ["Date", "Type", "Symbol", "Quantity", "Price", "Total"];
  const rows = trades.map((t) => [new Date(t.timestamp).toISOString(), t.transactionType.toUpperCase(), t.name, t.quantity, t.price.toFixed(2), t.total.toFixed(2)]);
  return [header, ...rows].map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export function downloadText(filename: string, text: string, type = "text/csv"): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Ticker search box (debounced, keyboard navigable) over /api/stocks/search. Selecting a result calls
// onPick (Markets/Watchlist decide what that means); Enter on a plain ticker picks it directly.
import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { api } from "../lib/api";
import type { SearchResult } from "../types";
import { cx } from "./ui";

const TICKER_RE = /^[A-Za-z][A-Za-z.]{0,9}$/;

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function StockSearch({ onPick, placeholder = "Search by company or ticker, e.g. Apple or XOM", autoFocus = false }: { onPick: (symbol: string) => void; placeholder?: string; autoFocus?: boolean }) {
  const [text, setText] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const query = useDebounced(text.trim(), 300);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    api.stocks
      .search(query)
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const exact = TICKER_RE.test(query) && !results.some((r) => r.symbol === query.toUpperCase());
  const options: SearchResult[] = [...results, ...(exact ? [{ symbol: query.toUpperCase(), name: "Open this ticker", type: null }] : [])];

  function pick(symbol: string) {
    setOpen(false);
    setText("");
    setActive(-1);
    onPick(symbol.toUpperCase());
  }

  return (
    <div ref={box} className="relative" role="search">
      <label className="relative block">
        <span className="sr-only">Search stocks</span>
        <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
        <input
          data-testid="search-input"
          role="combobox"
          aria-expanded={open && !!query}
          aria-controls="search-results"
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (!options.length) return;
              e.preventDefault();
              setActive((a) => (a + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const target = options[active >= 0 ? active : 0];
              if (target) pick(target.symbol);
              else if (TICKER_RE.test(text.trim())) pick(text.trim());
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          className="w-full rounded-2xl py-3.5 pl-11 pr-11 text-base shadow-card"
        />
        {text && (
          <button type="button" aria-label="Clear search" onClick={() => setText("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted hover:text-ink">
            <X size={16} />
          </button>
        )}
      </label>
      {open && query && (
        <ul id="search-results" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 max-h-80 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lift">
          {options.map((r, i) => (
            <li key={`${r.symbol}-${i}`} role="option" aria-selected={i === active}>
              <button type="button" data-testid={`search-result-${r.symbol}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(r.symbol)} className={cx("grid w-full grid-cols-[72px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2.5 text-left", i === active ? "bg-brand-50" : "hover:bg-surface-2")}>
                <strong className="text-ink">{r.symbol}</strong>
                <span className="truncate text-ink-2">{r.name}</span>
                <small className="text-xs text-muted">{r.type || ""}</small>
              </button>
            </li>
          ))}
          {!options.length && <li className="px-3 py-3 text-sm text-muted">{loading ? "Searching…" : `No US stocks match "${query}".`}</li>}
        </ul>
      )}
    </div>
  );
}

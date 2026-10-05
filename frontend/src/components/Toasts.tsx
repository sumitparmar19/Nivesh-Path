// Toast notifications (bottom-right), driven by the Zustand store.
import { X } from "lucide-react";
import { useStore } from "../store/useStore";
import { cx } from "./ui";

export default function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 grid w-[min(360px,calc(100vw-32px))] gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "pointer-events-auto flex items-start gap-3 rounded-xl border-l-4 bg-slate-900 p-3 text-sm text-white shadow-lift",
            t.kind === "error" ? "border-red-500" : t.kind === "info" ? "border-sky-400" : "border-brand-500",
          )}
        >
          <div className="flex-1">
            <b className="block">{t.title}</b>
            <span className="text-white/85">{t.message}</span>
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="text-white/60 hover:text-white">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

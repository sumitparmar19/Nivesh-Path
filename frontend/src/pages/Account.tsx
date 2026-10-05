// Account: profile (PATCH /api/me), security (change password), preferences (theme saved to the account)
// and a danger zone: reset the paper account to $100k or delete the account, each behind a typed word.
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, IdCard, LogOut, Palette, RotateCcw, ShieldCheck } from "lucide-react";
import { Button, Card, CardHeader, ErrorState, PageHeader, Skeleton, cx } from "../components/ui";
import { api } from "../lib/api";
import { initials } from "../lib/format";
import { readToken } from "../lib/session";
import { useStore } from "../store/useStore";
import type { ProfileUpdate, Theme } from "../types";

const TABS = [
  { id: "profile", label: "Profile", icon: IdCard },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "preferences", label: "Preferences", icon: Palette },
  { id: "danger", label: "Danger zone", icon: AlertTriangle },
] as const;
type Tab = (typeof TABS)[number]["id"];
const FIELDS: { key: keyof ProfileUpdate; label: string; type?: string; auto?: string; wide?: boolean }[] = [
  { key: "name", label: "Full name", auto: "name" },
  { key: "nickname", label: "Nickname" },
  { key: "email", label: "Email", type: "email", auto: "email" },
  { key: "mobile", label: "Mobile", type: "tel", auto: "tel" },
  { key: "country", label: "Country", auto: "country-name" },
  { key: "city", label: "City", auto: "address-level2" },
  { key: "address", label: "Address", auto: "street-address", wide: true },
];

function Avatar({ name }: { name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    const token = readToken();
    if (!token) return;
    fetch("/api/me/avatar", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (b && typeof URL.createObjectURL === "function") {
          url = URL.createObjectURL(b);
          setSrc(url);
        }
      })
      .catch(() => undefined);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [name]);
  return src ? (
    <img src={src} alt="" className="h-16 w-16 rounded-full" />
  ) : (
    <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-600 text-xl font-bold text-white">{initials(name)}</span>
  );
}

function ConfirmBox({ word, onConfirm, pending, label, password }: { word: string; onConfirm: (password: string) => void; pending: boolean; label: string; password?: boolean }) {
  const [typed, setTyped] = useState("");
  const [pw, setPw] = useState("");
  const ready = typed.trim().toUpperCase() === word && (!password || pw.length > 0);
  return (
    <form
      className="mt-3 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onConfirm(pw);
      }}
    >
      <label className="grid gap-1 text-sm font-semibold text-ink-2">
        Type {word} to confirm
        <input aria-label={`Type ${word} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="w-40" />
      </label>
      {password && (
        <label className="grid gap-1 text-sm font-semibold text-ink-2">
          Password
          <input aria-label="Password to confirm" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" className="w-48" />
        </label>
      )}
      <Button type="submit" variant="danger" disabled={!ready || pending}>{pending ? "Working…" : label}</Button>
    </form>
  );
}

export default function Account() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const { toast, updateUser, logout, theme, setTheme } = useStore();
  const [tab, setTab] = useState<Tab>("profile");
  const me = useQuery({ queryKey: ["me"], queryFn: api.me.get });
  const [form, setForm] = useState<ProfileUpdate>({});
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    if (me.data) {
      const { name, nickname, email, mobile, country, city, address } = me.data;
      setForm({ name, nickname, email, mobile, country, city, address });
      if (me.data.settings?.theme && me.data.settings.theme !== theme) setTheme(me.data.settings.theme);
    }
  }, [me.data]);

  const saveProfile = useMutation({
    mutationFn: api.me.update,
    onSuccess: (user) => {
      client.setQueryData(["me"], user);
      updateUser(user);
      toast("Your profile is saved to your account.", "success", "Profile updated");
    },
    onError: (err: Error) => toast(err.message, "error", "Profile not saved"),
  });
  const changePw = useMutation({
    mutationFn: () => api.me.changePassword(pw.current, pw.next),
    onSuccess: () => {
      setPw({ current: "", next: "", confirm: "" });
      toast("Use your new password next time you log in.", "success", "Password changed");
    },
    onError: (err: Error) => setPwError(err.message),
  });
  const saveTheme = useMutation({
    mutationFn: (t: Theme) => api.me.updateSettings({ theme: t }),
    onSuccess: (s) => toast(`${s.theme === "dark" ? "Dark" : "Light"} mode saved to your account.`, "success", "Theme"),
    onError: (err: Error) => toast(err.message, "error"),
  });
  const reset = useMutation({
    mutationFn: api.portfolio.reset,
    onSuccess: (r) => {
      ["portfolio", "holdings", "transactions", "ai-memory"].forEach((k) => client.invalidateQueries({ queryKey: [k] }));
      toast(`Removed ${r.tradesRemoved} trade${r.tradesRemoved === 1 ? "" : "s"}. You have $100,000 again.`, "success", "Account reset");
    },
    onError: (err: Error) => toast(err.message, "error"),
  });
  const remove = useMutation({
    mutationFn: api.me.delete,
    onSuccess: () => {
      logout();
      client.clear();
      toast("Your account and all its data were deleted.", "info", "Account deleted");
      navigate("/", { replace: true });
    },
    onError: (err: Error) => toast(err.message, "error"),
  });

  function submitPassword(e: FormEvent) {
    e.preventDefault();
    setPwError("");
    if (!pw.current) return setPwError("Enter your current password.");
    if (pw.next.length < 6) return setPwError("Use at least 6 characters for the new password.");
    if (pw.next !== pw.confirm) return setPwError("The two new passwords don't match.");
    changePw.mutate();
  }

  const u = me.data;
  return (
    <div className="grid gap-6">
      <Card className="flex flex-wrap items-center gap-4">
        {u ? <Avatar name={u.name} /> : <Skeleton className="h-16 w-16 rounded-full" />}
        <div className="min-w-0 flex-1">
          <PageHeader eyebrow="Account" title={u?.name || "Your account"} lede={u ? `${u.email}${u.createdAt ? ` · member since ${new Date(u.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}` : ""}` : "Loading…"} />
        </div>
        <Button variant="ghost" onClick={() => { logout(); navigate("/login"); }}><LogOut size={16} /> Log out</Button>
      </Card>
      {me.isError && <ErrorState message="Couldn't load your account." onRetry={() => me.refetch()} />}

      <div role="tablist" aria-label="Account sections" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cx("inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold", tab === id ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink")}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === "profile" && (
        <Card>
          <CardHeader title="Profile" icon={<IdCard size={18} />} />
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate(form);
            }}
            className="grid gap-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f.key} className={cx("grid gap-1.5 text-sm font-semibold text-ink-2", f.wide && "sm:col-span-2")}>
                  {f.label}
                  <input name={f.key} type={f.type || "text"} autoComplete={f.auto} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                </label>
              ))}
            </div>
            <Button type="submit" className="justify-self-start" disabled={saveProfile.isPending || !u}>{saveProfile.isPending ? "Saving…" : "Save profile"}</Button>
          </form>
        </Card>
      )}

      {tab === "security" && (
        <Card>
          <CardHeader title="Change password" icon={<ShieldCheck size={18} />} />
          <form onSubmit={submitPassword} noValidate className="grid max-w-md gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Current password<input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">New password<input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">Repeat new password<input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></label>
            {pwError && <p role="alert" className="text-sm text-down">{pwError}</p>}
            <Button type="submit" variant="ghost" className="justify-self-start" disabled={changePw.isPending}>{changePw.isPending ? "Changing…" : "Change password"}</Button>
          </form>
        </Card>
      )}

      {tab === "preferences" && (
        <Card>
          <CardHeader title="Appearance" icon={<Palette size={18} />} />
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">Saved to your account, so your theme follows you to every device.</p>
            <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-xl border border-line bg-surface-2 p-1">
              {(["light", "dark"] as Theme[]).map((t) => (
                <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => { setTheme(t); saveTheme.mutate(t); }} className={cx("rounded-lg px-4 py-1.5 text-sm font-semibold capitalize", theme === t ? "bg-surface text-ink shadow-card" : "text-muted")}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}

      {tab === "danger" && (
        <div className="grid gap-6">
          <Card>
            <CardHeader title="Reset paper account" icon={<RotateCcw size={18} />} />
            <p className="text-sm text-muted">Deletes all your trades and resets your cash to $100,000. Your profile, watchlist and saved analyses stay.</p>
            <ConfirmBox word="RESET" label="Reset to $100,000" pending={reset.isPending} onConfirm={() => reset.mutate()} />
          </Card>
          <Card className="border-down/30">
            <CardHeader title="Delete account" icon={<AlertTriangle size={18} />} />
            <p className="text-sm text-muted">This permanently deletes your account and all data: profile, trades, watchlist, analyses and AI memory. It can&apos;t be undone.</p>
            <ConfirmBox word="DELETE" label="Delete my account" password pending={remove.isPending} onConfirm={(p) => remove.mutate(p)} />
          </Card>
        </div>
      )}
    </div>
  );
}

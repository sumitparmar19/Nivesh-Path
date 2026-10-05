// Global client state (Zustand): the session, the theme and toast notifications. Server data (portfolio,
// trades, quotes) lives in TanStack Query instead. The session uses the same storage as the legacy pages.
import { create } from "zustand";
import type { Theme, User } from "../types";
import { applyTheme, clearSession, readTheme, readToken, readUser, saveSession, saveUser, type StoredUser } from "../lib/session";

export type ToastKind = "success" | "error" | "info";
export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
}

interface AppState {
  token: string | null;
  user: StoredUser | null;
  isAuthenticated: boolean;
  setAuth: (token: string, user: User) => void;
  updateUser: (user: Partial<User>) => void;
  logout: () => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;

  toasts: Toast[];
  toast: (message: string, kind?: ToastKind, title?: string) => void;
  dismissToast: (id: number) => void;
}

let nextToastId = 1;
const TITLES: Record<ToastKind, string> = { success: "Done", error: "Something went wrong", info: "Heads up" };

export const useStore = create<AppState>()((set, get) => ({
  token: readToken(),
  user: readUser(),
  isAuthenticated: readToken() !== null,
  setAuth: (token, user) => {
    saveSession(token, user);
    const theme = user.settings?.theme === "dark" ? "dark" : "light";
    applyTheme(theme);
    set({ token, user: { id: user.id, name: user.name, email: user.email, mobile: user.mobile }, isAuthenticated: true, theme });
  },
  updateUser: (user) => {
    const next = { ...get().user, ...{ id: user.id, name: user.name, email: user.email, mobile: user.mobile } };
    Object.keys(next).forEach((k) => (next as Record<string, unknown>)[k] === undefined && delete (next as Record<string, unknown>)[k]);
    saveUser(next);
    set({ user: next });
  },
  logout: () => {
    clearSession();
    set({ token: null, user: null, isAuthenticated: false });
  },

  theme: readTheme(),
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  toasts: [],
  toast: (message, kind = "success", title) => {
    const id = nextToastId++;
    set({ toasts: [...get().toasts, { id, kind, message, title: title || TITLES[kind] }] });
    window.setTimeout(() => get().dismissToast(id), 4500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

// Session storage shared with the legacy HTML pages: same localStorage keys ("token", "niveshPathUser",
// "niveshPathTheme"), so moving between React and not-yet-migrated pages never logs the user out.
import type { Theme, User } from "../types";

const TOKEN = "token";
const USER = "niveshPathUser";
const THEME = "niveshPathTheme";

export interface StoredUser {
  id?: string;
  name?: string;
  email?: string;
  mobile?: string;
}

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Returns the token if present and not expired (expired tokens are removed). */
export function readToken(): string | null {
  return safe(() => {
    const token = localStorage.getItem(TOKEN);
    if (!token) return null;
    const part = token.split(".")[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      clearSession();
      return null;
    }
    return token;
  }, null);
}

export function readUser(): StoredUser | null {
  return safe(() => JSON.parse(localStorage.getItem(USER) || "null") as StoredUser | null, null);
}

export function saveSession(token: string, user: User): void {
  safe(() => {
    localStorage.setItem(TOKEN, token);
    localStorage.setItem(USER, JSON.stringify({ isLoggedIn: true, token, id: user.id, name: user.name, email: user.email, mobile: user.mobile }));
    if (user.settings?.theme) localStorage.setItem(THEME, user.settings.theme);
  }, undefined);
}

export function saveUser(user: StoredUser): void {
  safe(() => {
    const current = JSON.parse(localStorage.getItem(USER) || "{}") as Record<string, unknown>;
    localStorage.setItem(USER, JSON.stringify({ ...current, ...user }));
  }, undefined);
}

export function clearSession(): void {
  safe(() => {
    localStorage.removeItem(TOKEN);
    localStorage.removeItem(USER);
  }, undefined);
}

export function readTheme(): Theme {
  return safe(() => (localStorage.getItem(THEME) === "dark" ? "dark" : "light"), "light");
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  safe(() => localStorage.setItem(THEME, theme), undefined);
}

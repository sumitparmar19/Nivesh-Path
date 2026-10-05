// Test helpers: render a page inside the real providers + router, and mock fetch per URL.
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { vi } from "vitest";
import Toasts from "../components/Toasts";
import { useStore } from "../store/useStore";

export function renderPage(element: ReactElement, { path = "/", route = "/", extra = [] as { path: string; element: ReactElement }[] } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [{ path, element }, ...extra, { path: "*", element: <div data-testid="other-route" /> }],
    { initialEntries: [route], future: { v7_relativeSplatPath: true } },
  );
  const utils = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} future={{ v7_startTransition: true }} />
      <Toasts />
    </QueryClientProvider>,
  );
  return { ...utils, router, client };
}

type Handler = (body: unknown, init: RequestInit) => unknown;
export type Routes = Record<string, unknown | Handler>;

/** Mocks fetch: keys are "METHOD /path" (query string ignored unless included in the key). Unknown -> 404. */
export function mockApi(routes: Routes) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method || "GET").toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const key = Object.keys(routes).find((k) => k === `${method} ${url}`) || Object.keys(routes).find((k) => k === `${method} ${url.split("?")[0]}`);
    if (!key) return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    let value = routes[key];
    if (typeof value === "function") value = (value as Handler)(body, init);
    if (value instanceof Response) return value;
    return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

export function errorResponse(status: number, error: string): Response {
  return new Response(JSON.stringify({ error, message: error }), { status });
}

/** A JWT the session helpers accept (exp far in the future). */
export function fakeToken(): string {
  const payload = btoa(JSON.stringify({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `x.${payload}.y`;
}

export function signIn(name = "Sumit Parmar"): void {
  const token = fakeToken();
  localStorage.setItem("token", token);
  useStore.setState({ token, user: { id: "u1", name, email: "s@x.com" }, isAuthenticated: true });
}

export function signOut(): void {
  useStore.setState({ token: null, user: null, isAuthenticated: false, toasts: [] });
}

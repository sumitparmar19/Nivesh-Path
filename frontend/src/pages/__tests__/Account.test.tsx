// Account: profile pre-fill + save, password validation, theme saved to account, reset and delete guards.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import Account from "../Account";
import { RequireAuth } from "../../App";
import { PublicLayout } from "../../components/Layout";
import { mockApi, renderPage, signIn } from "../../test/utils";
import { useStore } from "../../store/useStore";

const ME = { id: "u1", name: "Sumit Parmar", email: "s@x.com", mobile: "9999900001", nickname: "", country: "USA", city: "Buffalo", address: "", cashBalance: 100000, settings: { theme: "light", language: "English", notifications: true }, createdAt: "2026-10-01T00:00:00Z" };
const open = (extra = {}) => {
  const api = mockApi({ "GET /api/me": ME, "GET /api/me/avatar": new Response("<svg/>", { status: 200 }), ...extra });
  return { ...api, ...renderPage(<Account />, { path: "/account", route: "/account" }) };
};

describe("Account", () => {
  beforeEach(() => signIn());

  it("pre-fills the profile and saves changes with PATCH /api/me", async () => {
    const { calls } = open({ "PATCH /api/me": (body: Record<string, string>) => ({ ...ME, ...body }) });
    const city = await screen.findByDisplayValue("Buffalo");
    await userEvent.clear(city);
    await userEvent.type(city, "Rochester");
    await userEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toMatchObject({ city: "Rochester", name: "Sumit Parmar", email: "s@x.com" }));
    expect(await screen.findByText(/profile is saved/i)).toBeInTheDocument();
  });

  it("validates the new password before calling the API", async () => {
    const { calls } = open();
    await screen.findByDisplayValue("Buffalo");
    await userEvent.click(screen.getByRole("tab", { name: /security/i }));
    await userEvent.type(screen.getByLabelText(/current password/i), "secret1");
    await userEvent.type(screen.getByLabelText(/^new password/i), "newpass1");
    await userEvent.type(screen.getByLabelText(/repeat new password/i), "different");
    await userEvent.click(screen.getByRole("button", { name: /change password/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/don't match/i);
    expect(calls.some((c) => c.url === "/api/me/password")).toBe(false);
  });

  it("changing the theme applies it and saves it to the account", async () => {
    const { calls } = open({ "PATCH /api/me/settings": { theme: "dark", language: "English", notifications: true } });
    await screen.findByDisplayValue("Buffalo");
    await userEvent.click(screen.getByRole("tab", { name: /preferences/i }));
    await userEvent.click(screen.getByRole("radio", { name: /dark/i }));
    expect(useStore.getState().theme).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    await waitFor(() => expect(calls.find((c) => c.url === "/api/me/settings")?.body).toEqual({ theme: "dark" }));
  });

  it("reset needs the word RESET before the button works", async () => {
    const { calls } = open({ "POST /api/portfolio/reset": { success: true, cashBalance: 100000, tradesRemoved: 4 } });
    await screen.findByDisplayValue("Buffalo");
    await userEvent.click(screen.getByRole("tab", { name: /danger/i }));
    const button = screen.getByRole("button", { name: /reset to \$100,000/i });
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Type RESET to confirm"), "reset");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    await waitFor(() => expect(calls.find((c) => c.url === "/api/portfolio/reset")?.body).toEqual({ confirm: "RESET" }));
    expect(await screen.findByText(/removed 4 trades/i)).toBeInTheDocument();
  });

  it("delete needs DELETE and the password, then signs out and leaves", async () => {
    const { calls, router } = open({ "DELETE /api/me": { success: true } });
    await screen.findByDisplayValue("Buffalo");
    await userEvent.click(screen.getByRole("tab", { name: /danger/i }));
    const button = screen.getByRole("button", { name: /delete my account/i });
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(button).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Password to confirm"), "secret1");
    await userEvent.click(button);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(calls.find((c) => c.method === "DELETE")?.body).toEqual({ password: "secret1", confirm: "DELETE" });
    // The home page signs out on arrival (see the next test, which has the real layout and RequireAuth)
    expect(router.state.location.state).toEqual({ signedOut: true });
  });

  // Live check (Oct 2026): on the real app, Account sits inside RequireAuth. Signing out first let RequireAuth send the
  // just-deleted user to /login?redirect=/account before the move to the home page happened.
  it("after deleting the account you land on the home page, not on the login page", async () => {
    mockApi({ "GET /api/me": ME, "GET /api/me/avatar": new Response("<svg/>", { status: 200 }), "DELETE /api/me": { success: true }, "GET /search": [] });
    const router = createMemoryRouter(
      [
        { element: <PublicLayout />, children: [{ path: "/", element: <div>home page</div> }] },
        { path: "/login", element: <div>login page</div> },
        { path: "/portfolio", element: <div>portfolio page</div> },
        { element: <RequireAuth />, children: [{ path: "/account", element: <Account /> }] },
      ],
      { initialEntries: ["/account"], future: { v7_relativeSplatPath: true } },
    );
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </QueryClientProvider>,
    );
    await screen.findByDisplayValue("Buffalo");
    await userEvent.click(screen.getByRole("tab", { name: /danger/i }));
    await userEvent.type(screen.getByLabelText("Type DELETE to confirm"), "DELETE");
    await userEvent.type(screen.getByLabelText("Password to confirm"), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(await screen.findByText("home page")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 50));
    expect(router.state.location.pathname).toBe("/");
    expect(screen.queryByText("login page")).not.toBeInTheDocument();
    expect(useStore.getState().isAuthenticated).toBe(false);
  });
});

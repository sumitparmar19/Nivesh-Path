// Layout + routing: shared sidebar items, active link, auth guard redirect, theme toggle saved, logout.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AppLayout, PublicLayout, SIDEBAR } from "../Layout";
import { PageFallback, RequireAuth } from "../../App";
import { mockApi, signIn, signOut } from "../../test/utils";
import { useStore } from "../../store/useStore";

function app(route: string) {
  const router = createMemoryRouter(
    [
      { path: "/login", element: <div>login page</div> },
      { element: <AppLayout />, children: [{ path: "/markets", element: <div>markets page</div> }, { element: <RequireAuth />, children: [{ path: "/portfolio", element: <div>portfolio page</div> }] }] },
    ],
    { initialEntries: [route] },
  );
  render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}

describe("Layout and routing", () => {
  beforeEach(() => signOut());

  it("renders the shared sidebar with the 7 app sections and marks the current one", () => {
    signIn();
    app("/portfolio");
    const nav = screen.getByRole("navigation", { name: "App" });
    SIDEBAR.forEach((item) => expect(nav).toHaveTextContent(item.label));
    expect(screen.getAllByRole("link", { name: /portfolio/i }).some((a) => a.getAttribute("aria-current") === "page")).toBe(true);
    expect(screen.getByRole("contentinfo")).toHaveTextContent(/a project by sumit parmar/i);
  });

  it("sends logged-out visitors from a protected page to login with a redirect", async () => {
    const router = app("/portfolio");
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(router.state.location.search).toBe("?redirect=%2Fportfolio");
  });

  it("public pages show Log in / Sign up when logged out", () => {
    app("/markets");
    expect(screen.getByText("markets page")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign up" })).toHaveAttribute("href", "/register");
  });

  it("the theme toggle switches mode and saves it for a logged-in user", async () => {
    signIn();
    const { calls } = mockApi({ "PATCH /api/me/settings": { theme: "dark", language: "English", notifications: true } });
    useStore.setState({ theme: "light" });
    app("/portfolio");
    await userEvent.click(screen.getByRole("button", { name: /switch to dark mode/i }));
    expect(document.documentElement).toHaveClass("dark");
    await waitFor(() => expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ theme: "dark" }));
  });

  it("log out clears the session and goes to login", async () => {
    signIn();
    const router = app("/portfolio");
    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(localStorage.getItem("token")).toBeNull();
  });

  // Lighthouse (live check, Oct 2026): CLS 0.6-0.75 on phones came from the footer jumping when a page's code arrived
  // and from logos without a size. These keep the layout still while things load.
  it("logos declare their size, so the header and footer don't move when the image loads", () => {
    app("/markets");
    const logos = document.querySelectorAll('img[src="/logo.png"]');
    expect(logos.length).toBeGreaterThanOrEqual(2);
    logos.forEach((img) => {
      expect(img.getAttribute("width")).toBe("269");
      expect(img.getAttribute("height")).toBe("189");
    });
  });

  it("a page that is still loading holds a full screen of space, so the footer starts below the fold", () => {
    render(<PageFallback />);
    expect(screen.getByTestId("page-fallback")).toHaveClass("min-h-screen");
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
  });

  it("a signed-in visitor to the home page goes to the portfolio before the public frame (and its footer) draws", async () => {
    signIn();
    const router = createMemoryRouter(
      [
        { element: <PublicLayout />, children: [{ path: "/", element: <div>landing</div> }] },
        { path: "/portfolio", element: <div>portfolio page</div> },
      ],
      { initialEntries: ["/"] },
    );
    render(<QueryClientProvider client={new QueryClient()}><RouterProvider router={router} /></QueryClientProvider>);
    expect(await screen.findByText("portfolio page")).toBeInTheDocument();
    expect(screen.queryByText("landing")).not.toBeInTheDocument();
    expect(screen.queryByRole("contentinfo")).not.toBeInTheDocument();
  });
});

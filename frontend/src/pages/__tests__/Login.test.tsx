// Login page: validation, success redirect (default and ?redirect=), API errors, session shared with legacy pages.
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Login from "../Login";
import { errorResponse, fakeToken, mockApi, renderPage, signOut } from "../../test/utils";

const USER = { id: "u1", name: "Sumit Parmar", email: "s@x.com", mobile: "999", nickname: "", country: "", city: "", address: "", cashBalance: 100000, settings: { theme: "dark", language: "English", notifications: true } };

describe("Login", () => {
  beforeEach(() => signOut());

  it("renders the form without the removed social/forgot-password links", () => {
    renderPage(<Login />, { path: "/login", route: "/login" });
    expect(screen.getByRole("heading", { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.queryByText(/forgot password/i)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign up/i })).toHaveAttribute("href", "/register");
  });

  it("asks for both fields before calling the API", async () => {
    const { calls } = mockApi({});
    renderPage(<Login />, { path: "/login", route: "/login" });
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/email or mobile/i);
    expect(calls).toHaveLength(0);
  });

  it("logs in with an email, saves the shared session and theme, and opens /portfolio", async () => {
    const token = fakeToken();
    const { calls } = mockApi({ "POST /api/login": { token, user: USER } });
    const { router } = renderPage(<Login />, { path: "/login", route: "/login" });
    await userEvent.type(screen.getByLabelText(/email or mobile/i), "s@x.com");
    await userEvent.type(screen.getByLabelText(/password/i), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/portfolio"));
    expect(calls[0].body).toEqual({ email: "s@x.com", password: "secret1" });
    expect(localStorage.getItem("token")).toBe(token);
    expect(localStorage.getItem("niveshPathTheme")).toBe("dark");
  });

  it("sends a mobile number as mobile and honours ?redirect", async () => {
    const { calls } = mockApi({ "POST /api/login": { token: fakeToken(), user: USER } });
    const { router } = renderPage(<Login />, { path: "/login", route: "/login?redirect=%2Fstock%2FTSLA" });
    await userEvent.type(screen.getByLabelText(/email or mobile/i), "9999900001");
    await userEvent.type(screen.getByLabelText(/password/i), "secret1");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/stock/TSLA"));
    expect(calls[0].body).toEqual({ mobile: "9999900001", password: "secret1" });
  });

  it("shows the API error and ignores off-site redirects", async () => {
    mockApi({ "POST /api/login": errorResponse(401, "Invalid mobile number or password") });
    renderPage(<Login />, { path: "/login", route: "/login?redirect=//evil.example" });
    await userEvent.type(screen.getByLabelText(/email or mobile/i), "a@b.co");
    await userEvent.type(screen.getByLabelText(/password/i), "nope123");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid mobile number or password/i);
  });
});

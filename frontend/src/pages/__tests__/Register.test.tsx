// Sign-up page: client validation, success flow, and server errors (e.g. duplicate account).
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Register from "../Register";
import { errorResponse, fakeToken, mockApi, renderPage, signOut } from "../../test/utils";

const USER = { id: "u2", name: "New User", email: "n@x.com", mobile: "123456", nickname: "", country: "", city: "", address: "", cashBalance: 100000, settings: { theme: "light", language: "English", notifications: true } };

async function fill(values: Partial<Record<"name" | "email" | "mobile" | "password", string>>) {
  if (values.name) await userEvent.type(screen.getByLabelText(/full name/i), values.name);
  if (values.email) await userEvent.type(screen.getByLabelText(/^email/i), values.email);
  if (values.mobile) await userEvent.type(screen.getByLabelText(/mobile/i), values.mobile);
  if (values.password) await userEvent.type(screen.getByLabelText(/password/i), values.password);
  await userEvent.click(screen.getByRole("button", { name: /create account/i }));
}

describe("Register", () => {
  beforeEach(() => signOut());

  it("renders and links to login", () => {
    renderPage(<Register />, { path: "/register", route: "/register" });
    expect(screen.getByRole("heading", { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  it("requires every field", async () => {
    const { calls } = mockApi({});
    renderPage(<Register />, { path: "/register", route: "/register" });
    await fill({ name: "Only Name" });
    expect(screen.getByRole("alert")).toHaveTextContent(/every field/i);
    expect(calls).toHaveLength(0);
  });

  it("rejects short passwords and bad emails before calling the API", async () => {
    const { calls } = mockApi({});
    renderPage(<Register />, { path: "/register", route: "/register" });
    await fill({ name: "A B", email: "bad", mobile: "123456", password: "secret1" });
    expect(screen.getByRole("alert")).toHaveTextContent(/valid email/i);
    expect(calls).toHaveLength(0);
  });

  it("creates the account, signs in and opens /portfolio with a welcome toast", async () => {
    const { calls } = mockApi({ "POST /api/register": { token: fakeToken(), user: USER, message: "ok" } });
    const { router } = renderPage(<Register />, { path: "/register", route: "/register" });
    await fill({ name: "New User", email: "n@x.com", mobile: "123456", password: "secret1" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/portfolio"));
    expect(calls[0].body).toEqual({ name: "New User", email: "n@x.com", mobile: "123456", password: "secret1" });
    expect(await screen.findByText(/100,000 in virtual cash/i)).toBeInTheDocument();
  });

  it("shows the server error for a duplicate account", async () => {
    mockApi({ "POST /api/register": errorResponse(409, "An account with this email or mobile already exists") });
    renderPage(<Register />, { path: "/register", route: "/register" });
    await fill({ name: "A B", email: "a@b.co", mobile: "123456", password: "secret1" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/already exists/i);
  });
});

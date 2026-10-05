// Landing: redirect for logged-in users, live price strip, CTAs.
import { screen } from "@testing-library/react";
import Landing from "../Landing";
import { mockApi, renderPage, signIn, signOut } from "../../test/utils";

const open = () => renderPage(<Landing />, { path: "/", route: "/", extra: [{ path: "/portfolio", element: <div>portfolio page</div> }] });

describe("Landing", () => {
  beforeEach(() => signOut());

  it("sends logged-in users to their portfolio", async () => {
    signIn();
    mockApi({});
    open();
    expect(await screen.findByText("portfolio page")).toBeInTheDocument();
  });

  it("renders the live price strip with links to stock pages", async () => {
    mockApi({ "GET /search": { AAPL: { c: 250, d: 2, dp: 0.8 }, TSLA: { c: 200, d: -6, dp: -2.9 } } });
    open();
    const strip = await screen.findByTestId("price-strip");
    expect(strip.querySelector('a[href="/stock/AAPL"]')).toHaveTextContent("$250.00");
  });

  it("the main CTA goes to sign-up and the login link to /login", () => {
    mockApi({});
    open();
    expect(screen.getByRole("link", { name: /sign up free/i })).toHaveAttribute("href", "/register");
    expect(screen.getByRole("link", { name: /^log in$/i })).toHaveAttribute("href", "/login");
  });

  it("shows the three real features", () => {
    mockApi({});
    open();
    expect(screen.getByText(/paper trading with \$100,000/i)).toBeInTheDocument();
    expect(screen.getByText(/an ai advisor that cites your trades/i)).toBeInTheDocument();
    expect(screen.getByText(/your trading dna/i)).toBeInTheDocument();
  });
});

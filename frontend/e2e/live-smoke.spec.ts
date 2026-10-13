// Live smoke test: safe to run against the real site (E2E_LIVE=1, E2E_BASE_URL=https://...). It signs up a NEW test
// user, checks every page and feature with small real orders, then deletes the user (Account -> Delete account).
// Costly calls are opt-in: one AI analysis with E2E_LIVE_AI=1, one contact email with E2E_LIVE_CONTACT=1.
// Never runs in normal CI (skipped without E2E_LIVE=1); the made-up FOMO/DROP tickers are not used.
// Rehearse locally: E2E_LIVE=1 E2E_LIVE_LOCAL=1 against a server started with FAKE_MARKET_DATA=1.
import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

test.skip(process.env.E2E_LIVE !== "1", "live smoke runs only with E2E_LIVE=1");
test.describe.configure({ mode: "serial" });

const id = `${Date.now()}`.slice(-9);
const email = `e2e-live-${id}@example.com`;
let password = `Live-${id}-a`;
const newPassword = `Live-${id}-b`;
let page: Page;
let token = "";
const errors: string[] = [];

async function api(request: APIRequestContext, path: string, init: { method?: string; data?: unknown; headers?: Record<string, string> } = {}) {
  const res = await request.fetch(path, {
    method: init.method || "GET",
    data: init.data,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers || {}) },
    maxRedirects: 0,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status(), json: json as Record<string, unknown> & unknown[], headers: res.headers() };
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on("pageerror", (err) => errors.push(err.message));
});

test.afterAll(async ({ request }) => {
  // Safety net: if a step failed before the delete step, still remove the test user.
  if (token) await api(request, "/api/me", { method: "DELETE", data: { password, confirm: "DELETE" } }).catch(() => undefined);
  await page.close();
});

test("public pages, legacy redirects, status", async ({ request }) => {
  for (const path of ["/", "/about", "/contact", "/whats-new", "/markets"]) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
  const missing = await page.goto("/no-such-page-live-check");
  expect(missing?.status()).toBe(404);
  await expect(page.getByText(/page not found/i)).toBeVisible();

  for (const [from, to] of [["/search.html", "/markets"], ["/AAPL.html", "/stock/AAPL"], ["/portfolio.html", "/portfolio"]]) {
    const r = await api(request, from);
    expect(r.status, from).toBe(301);
    expect(r.headers.location).toBe(to);
  }

  expect((await api(request, "/health")).status).toBe(200);
  const status = await api(request, "/api/status");
  expect(status.status).toBe(200);
  expect(status.json.ledger).toMatchObject({ backend: "postgres", tradingPaused: false });
  expect(status.json.ai).toMatchObject({ reachable: true });
  // E2E_LIVE_LOCAL=1 rehearses this file against a local server, which has no Claude key
  if (process.env.E2E_LIVE_LOCAL !== "1") expect(status.json.ai).toMatchObject({ llmConfigured: true });

  await page.goto("/whats-new");
  await expect(page.getByText(/PostgreSQL/).first()).toBeVisible();
  if (process.env.E2E_LIVE_LOCAL !== "1") await expect(page.getByText("All systems go")).toBeVisible();
  await expect(page.getByText(/Done at last restart/)).toBeVisible();
});

test("security: /internal is hidden, headers are set, no keys in the page", async ({ request }) => {
  for (const path of ["/internal/trades/users", "/internal/trades?userId=x", "/internal/jobs/held-tickers"]) {
    expect((await api(request, path, { headers: { "X-Internal-Token": "guess" } })).status, path).toBe(404);
  }
  const home = await api(request, "/");
  for (const h of ["strict-transport-security", "x-content-type-options", "x-frame-options", "referrer-policy"]) expect(home.headers[h], h).toBeTruthy();
  expect(home.headers["x-powered-by"]).toBeUndefined();
  await page.goto("/");
  const html = await page.content();
  expect(html).not.toMatch(/sk-ant-|re_[A-Za-z0-9]{16,}|glc_[A-Za-z0-9]{10,}|mongodb(\+srv)?:\/\/|postgres(ql)?:\/\//);
});

test("auth: protected page redirects, register, wrong password, log in", async () => {
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fportfolio/);

  await page.goto("/register");
  await page.getByLabel("Full name").fill("Live Smoke");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mobile number").fill(`9${id}`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByTestId("cash-balance")).toContainText("$100,000.00");
  token = await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      const m = (localStorage.getItem(k) || "").match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
      if (m) return m[0];
    }
    return "";
  });
  expect(token).not.toBe("");

  await page.getByRole("button", { name: /log out/i }).first().click();
  await page.goto("/login");
  await page.getByLabel(/email or mobile/i).fill(email);
  await page.getByLabel(/^password/i).fill("not-the-password");
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();

  await page.getByLabel(/^password/i).fill(password);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
});

test("markets and stock detail", async ({ request }) => {
  await page.goto("/markets");
  await expect(page.getByTestId(/^row-/).first()).toBeVisible();
  await page.getByTestId("search-input").fill("TSLA");
  await expect(page.getByTestId("search-result-TSLA")).toBeVisible();
  const curated = JSON.stringify((await api(request, "/api/stocks/curated")).json);
  expect(curated).not.toMatch(/"(FOMO|DROP)"/);

  await page.goto("/stock/AAPL");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Apple/i);
  await expect(page.getByTestId("stock-price")).toContainText("$");
  await page.getByTestId("quantity-input").fill("2");
  const two = await page.getByTestId("order-total").innerText();
  await page.getByTestId("quantity-input").fill("3");
  await expect(page.getByTestId("order-total")).not.toHaveText(two);
});

test("trading on the Postgres ledger: buy, sell, clear errors, double-click = one trade, idempotency", async ({ request }) => {
  const count = async () => ((await api(request, "/api/transactions")).json as unknown[]).length;
  await page.goto("/stock/AAPL");
  await page.getByTestId("quantity-input").fill("2");
  await page.getByRole("button", { name: "Buy 2 AAPL" }).click();
  await expect(page.getByTestId("trade-success")).toBeVisible();

  await page.getByRole("tab", { name: /sell/i }).click();
  await page.getByTestId("quantity-input").fill("1");
  await page.getByRole("button", { name: "Sell 1 AAPL" }).click();
  await expect(page.getByTestId("trade-success")).toBeVisible();
  await page.getByTestId("quantity-input").fill("50");
  await page.getByRole("button", { name: "Sell 50 AAPL" }).click();
  await expect(page.getByTestId("trade-error")).toContainText(/can't sell|not enough/i);

  await page.getByRole("tab", { name: /buy/i }).click();
  await page.getByTestId("quantity-input").fill("100000");
  await page.getByRole("button", { name: "Buy 100000 AAPL" }).click();
  await expect(page.getByTestId("trade-error")).toContainText(/insufficient funds/i);

  const before = await count();
  await page.getByTestId("quantity-input").fill("1");
  await page.getByRole("button", { name: "Buy 1 AAPL" }).dblclick();
  await expect(page.getByTestId("trade-success")).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await count()).toBe(before + 1);

  const key = `live-smoke-${id}`;
  const order = { symbol: "AAPL", quantity: 1, type: "SELL" };
  const first = await api(request, "/api/trades", { method: "POST", data: order, headers: { "Idempotency-Key": key } });
  const again = await api(request, "/api/trades", { method: "POST", data: order, headers: { "Idempotency-Key": key } });
  expect([200, 201]).toContain(first.status);
  expect(again.status).toBe(200);
  expect(again.json.replayed).toBe(true);

  const holdings = (await api(request, "/api/portfolio/holdings")).json as unknown as { symbol: string; quantity: number }[];
  expect(holdings.find((h) => h.symbol === "AAPL")?.quantity).toBe(1);
});

test("portfolio, transactions, Behavioral Mirror, watchlist", async ({ request }) => {
  await page.goto("/portfolio");
  await expect(page.getByTestId("holding-AAPL")).toBeVisible();
  await expect(page.locator(".recharts-wrapper").first()).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByTestId("trade-row")).toHaveCount(4);

  await page.goto("/behavioral-mirror");
  await expect(page.getByTestId(/^score-/).first()).toBeVisible();
  const summary = await api(request, "/api/patterns/summary");
  expect(summary.status).toBe(200);
  expect((await api(request, "/api/patterns/acknowledge-all", { method: "POST" })).status).toBe(200);

  await page.goto("/watchlist");
  await page.getByPlaceholder(/add a stock/i).fill("NVDA");
  await page.getByTestId("search-result-NVDA").click();
  await expect(page.getByTestId("watch-row-NVDA")).toBeVisible();
  await page.getByRole("button", { name: /remove NVDA/i }).click();
  await expect(page.getByTestId("watch-row-NVDA")).toHaveCount(0);
});

test("advisor: memory status (+ one analysis only with E2E_LIVE_AI=1)", async ({ request }) => {
  const memory = await api(request, "/api/ai/memory");
  expect(memory.status).toBe(200);
  expect(memory.json.tradesInDatabase).toBe(4);
  await page.goto("/advisor");
  await expect(page.getByRole("button", { name: "Analyze my portfolio" })).toBeVisible();
  if (process.env.E2E_LIVE_AI === "1") {
    await page.getByRole("button", { name: "Analyze my portfolio" }).click();
    await expect(page.getByTestId("ai-result")).toBeVisible({ timeout: 90_000 });
    const history = (await api(request, "/api/ai/history")).json as unknown as { id: string }[];
    expect(history).toHaveLength(1);
    expect((await api(request, `/api/ai/history/${history[0].id}`, { method: "DELETE" })).status).toBe(200);
  }
});

test("account: profile, theme, password", async ({ request }) => {
  await page.goto("/account");
  await page.getByLabel("City").fill("Buffalo");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect.poll(async () => (await api(request, "/api/me")).json.city).toBe("Buffalo");

  await page.getByRole("tab", { name: "Preferences" }).click();
  await page.getByRole("radio", { name: /dark/i }).click();
  await expect.poll(async () => (await api(request, "/api/me/settings")).json.theme).toBe("dark");
  await page.getByRole("radio", { name: /light/i }).click();

  await page.getByRole("tab", { name: "Security" }).click();
  await page.getByLabel("Current password").fill(password);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Repeat new password").fill(newPassword);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect
    .poll(async () => (await api(request, "/api/login", { method: "POST", data: { identifier: email, email, password: newPassword } })).status)
    .toBe(200);
  password = newPassword;
});

test("contact (one real email only with E2E_LIVE_CONTACT=1)", async () => {
  test.skip(process.env.E2E_LIVE_CONTACT !== "1", "sends a real email: opt-in");
  await page.goto("/contact");
  await page.getByPlaceholder("What's on your mind?").fill("Automated live smoke test message. Safe to ignore.");
  await page.locator("form").first().getByRole("button").last().click();
  await expect(page.getByText(/message received/i)).toBeVisible();
});

test("delete account removes the test user", async ({ request }) => {
  await page.goto("/account");
  await page.getByRole("tab", { name: "Danger zone" }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByLabel("Password to confirm").fill(password);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await api(request, "/api/login", { method: "POST", data: { identifier: email, email, password } })).status).toBe(401);
  token = "";
  expect(errors).toEqual([]);
});

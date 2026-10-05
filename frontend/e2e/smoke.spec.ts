// Smoke test of the main user journey in a real browser: sign up, see $100k, find a stock, buy it, see it in
// the portfolio and transactions, ask the AI advisor, log out. Run against a server with FAKE_MARKET_DATA=1.
import { test, expect } from "@playwright/test";

test("new user can sign up, buy a stock, get an analysis and log out", async ({ page }) => {
  const id = Date.now().toString().slice(-8);
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  // Sign up -> lands on the portfolio with $100,000 virtual cash
  await page.goto("/register");
  await page.getByLabel("Full name").fill("E2E Tester");
  await page.getByLabel("Email").fill(`e2e${id}@example.com`);
  await page.getByLabel("Mobile number").fill(`55${id}`);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/portfolio$/);
  await expect(page.getByTestId("cash-balance")).toContainText("$100,000.00");

  // Markets search -> stock page
  await page.goto("/markets");
  await page.getByTestId("search-input").fill("TSLA");
  await page.getByTestId("search-result-TSLA").click();
  await expect(page).toHaveURL(/\/stock\/TSLA$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Tesla");

  // Buy 3 shares
  await page.getByTestId("quantity-input").fill("3");
  await expect(page.getByTestId("order-total")).not.toHaveText("$0.00");
  await page.getByRole("button", { name: "Buy 3 TSLA" }).click();
  await expect(page.getByTestId("trade-success")).toBeVisible();

  // The holding shows up in the portfolio and the trade in the history
  await page.goto("/portfolio");
  await expect(page.getByTestId("holding-TSLA")).toBeVisible();
  await expect(page.getByTestId("cash-balance")).not.toContainText("$100,000.00");
  await page.goto("/transactions");
  await expect(page.getByRole("cell", { name: "TSLA" }).first()).toBeVisible();

  // AI advisor analyzes the real holdings (rule-based when no Claude key is set)
  await page.goto("/advisor");
  await expect(page.getByLabel("Symbol").first()).toHaveValue("TSLA");
  await page.getByRole("button", { name: "Analyze my portfolio" }).click();
  await expect(page.getByTestId("ai-result")).toBeVisible({ timeout: 45_000 });

  // Legacy URLs redirect to the React pages
  await page.goto("/portfolio.html");
  await expect(page).toHaveURL(/\/portfolio$/);

  // Log out -> protected pages send you to login
  await page.getByRole("button", { name: /log out/i }).click();
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?redirect=/);

  expect(errors).toEqual([]);
});

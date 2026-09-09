import { test, expect } from "@playwright/test";

test.describe("release smoke", () => {
  test("judge journey stays on the cached marketplace", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /What do you want your money to do/i })).toBeVisible();
    await expect(page.locator(".mh-outcome-icon svg").first()).toBeVisible();
    const stablecoinCard = page.locator(".mh-outcome-card").filter({ hasText: "Stablecoin Yield" }).first();
    await expect(stablecoinCard).toBeVisible();

    await stablecoinCard.getByRole("link", { name: /Explore setup/i }).click();
    await expect(page.getByRole("heading", { name: "Stablecoin Yield" })).toBeVisible();
    await page.locator('a[href^="/find/context"]').click();

    await expect(page).toHaveURL(/\/find\/context/);
    await page.locator("select[name=asset]").selectOption("USDC");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel("Conservative").check();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel("Ask before acting").check();
    await page.getByRole("button", { name: /show my matches/i }).click();

    await expect(page).toHaveURL(/\/find\/recommendations/);
    const recommendation = page.locator(".recommendation-grid .panel").filter({ hasText: "Stablecoin Yield" }).first();
    await expect(recommendation).toBeVisible();
    await expect(recommendation).toContainText(/Strong match|Good match|Partial match/);
    const reviewHref = await recommendation.getByRole("link", { name: /Review setup/i }).getAttribute("href");
    expect(reviewHref).toMatch(/\/outcomes\/create\?/);

    await recommendation.getByRole("link", { name: /Review setup/i }).click();
    await expect(page.getByRole("heading", { name: "Review your setup." })).toBeVisible();
    await expect(page.getByText("READY TO ACTIVATE")).toBeVisible();
    await expect(page.locator(".role-row a[href^='/agents/live-']").first()).toBeVisible();
    await expect(page.locator(".notice")).toHaveCount(0);
    await page.getByRole("link", { name: /Back to matches/i }).click();
    await expect(page).toHaveURL(/\/find\/recommendations/);
    await expect(page.getByText("Stablecoin Yield").first()).toBeVisible();

    await page.getByRole("link", { name: "Agents" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const agentCard = page.locator(".agent-card").filter({ hasText: "Available now" }).first();
    await expect(agentCard).toBeVisible();
    await agentCard.click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Capabilities" })).toBeVisible();
    await expect(page.locator(".detail-side")).toContainText(/Available now|Registered|Currently unavailable/);

    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect
      .poll(
        async () =>
          (await page.locator(".wallet-error").count()) > 0 ||
          (await page.locator("iframe[src*='privy'], #privy-dialog, [id^='privy']").count()) > 0 ||
          (await page.getByText(/continue with|enter your email|connect a wallet/i).count()) > 0,
        { timeout: 20_000, message: "sign-in should open a wallet or account flow" },
      )
      .toBe(true);
  });

  test("multi-role outcomes resolve each role from current supply", async ({ page }) => {
    await page.goto("/find/context?goal=combine&outcome=protect-and-earn&risk=balanced&control=ask");
    await page.locator("select[name=asset]").selectOption("USDC");
    await page.locator("select[name=protocol]").selectOption("Venus");
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel("Balanced").check();
    await page.getByRole("button", { name: /continue/i }).click();
    await page.getByLabel("Ask before acting").check();
    await page.getByRole("button", { name: /show my matches/i }).click();

    const recommendation = page.locator(".recommendation-grid .panel").filter({ hasText: "Protect & Earn" }).first();
    await expect(recommendation).toBeVisible();
    const roleLinks = recommendation.locator(".role-row a[href^='/agents/live-']");
    await expect(roleLinks).toHaveCount(2);
    expect(new Set(await roleLinks.evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).size).toBe(2);
    await expect(recommendation).not.toContainText(/not currently available|SETUP UNAVAILABLE/i);
  });
});

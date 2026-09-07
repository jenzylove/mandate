import { test, expect } from "@playwright/test";

// The marketplace is browsed by scrolling down through many compact tiles.
// These assert the density, the click target and the image behaviour, so the
// layout cannot quietly regress into something that needs sideways scrolling.

test.describe("agents marketplace", () => {
  test("scrolls vertically, never sideways, at every width", async ({ page }) => {
    for (const [label, width, height, minPerRow] of [
      ["desktop", 1440, 900, 4],
      ["tablet", 900, 1000, 3],
      ["mobile", 390, 844, 2],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("/agents");
      await expect(page.locator(".agent-card").first()).toBeVisible();

      // The page must not scroll sideways at all.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(1);

      // Count tiles sharing the first row's y position.
      const perRow = await page.evaluate(() => {
        const cards = [...document.querySelectorAll(".agent-card")];
        if (!cards.length) return 0;
        const top = Math.round(cards[0].getBoundingClientRect().top);
        return cards.filter((c) => Math.abs(Math.round(c.getBoundingClientRect().top) - top) < 4).length;
      });
      expect(perRow, `${label} should fit at least ${minPerRow} per row`).toBeGreaterThanOrEqual(minPerRow);
    }
  });

  test("shows a scannable catalogue rather than a handful of large cards", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/agents");
    const cards = page.locator(".agent-card");
    const total = await cards.count();
    expect(total, "the marketplace should list its whole live roster").toBeGreaterThanOrEqual(20);

    // A tile is a tile, not a panel: it must be a small fraction of the viewport.
    const box = await cards.first().boundingBox();
    expect(box!.width, "a tile should be compact").toBeLessThan(360);
    expect(box!.height, "a tile should be compact").toBeLessThan(240);
  });

  test("the whole tile is the link, from any point on it", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/agents");
    const card = page.locator(".agent-card").first();
    const href = await card.getAttribute("href");
    expect(href).toMatch(/^\/agents\//);

    const box = (await card.boundingBox())!;
    // Corners and centre: whitespace, image, text alike.
    for (const [dx, dy] of [
      [0.5, 0.5],
      [0.1, 0.12],
      [0.9, 0.88],
    ] as const) {
      await page.goto("/agents");
      await page.mouse.click(box.x + box.width * dx, box.y + box.height * dy);
      await expect(page).toHaveURL(new RegExp(href!.replace(/\//g, "\\/")));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("every tile opens its own agent, not a shared one", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/agents");
    const hrefs = await page.locator(".agent-card").evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!),
    );
    expect(new Set(hrefs).size, "tiles must not share a destination").toBe(hrefs.length);

    // Spot-check a sample rather than all 25, and require a real detail page.
    for (const href of [hrefs[0], hrefs[Math.floor(hrefs.length / 2)], hrefs.at(-1)!]) {
      const res = await page.goto(href);
      expect(res?.status(), `${href} should render`).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("a broken agent image falls back to the monogram", async ({ page }) => {
    // Fail every remote image, which is what a dead host or hotlink block does.
    await page.route("**/*", (route) =>
      route.request().resourceType() === "image" ? route.abort() : route.continue(),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/agents");

    const avatars = page.locator(".agent-card .agent-avatar");
    await expect(avatars.first()).toBeVisible();
    // With images refused, every avatar must still render a visible initial.
    const empty = await avatars.evaluateAll((els) =>
      els.filter((e) => !(e.textContent ?? "").trim()).length,
    );
    expect(empty, "every avatar should fall back to an initial").toBe(0);
  });

  test("live and demo labelling stays truthful", async ({ page }) => {
    await page.goto("/agents");
    const body = await page.locator("body").innerText();
    expect(body).not.toMatch(/Seeded demo collection/i);
    // The catalogue only lists real agents, so it must not claim seeded ones.
    expect(body).not.toMatch(/\bseeded\b/i);
    expect(body).toMatch(/live onchain/i);
  });
});

import { test, expect, type Page } from "@playwright/test";

// Item 4: the public surface must actually work. Every internal link reachable
// from the entry points is followed once and must return a real page, not a 404
// and not a server error. Run this against the deployed URL as well as locally:
//   E2E_BASE_URL=https://<deployment> npx playwright test e2e/public-surface
//
// No wallet is injected anywhere in this file. A stranger sees exactly this.

const ENTRY = ["/", "/agents", "/outcomes", "/my-outcomes", "/find/goal", "/build-agent"];

async function internalLinks(page: Page): Promise<string[]> {
  return page.$$eval("a[href]", (as) =>
    as
      .map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? "")
      .filter((h) => h.startsWith("/") && !h.startsWith("//"))
      .map((h) => h.split("#")[0])
      .filter(Boolean),
  );
}

test.describe("public surface", () => {
  test("no dead links anywhere reachable from the entry points", async ({ page }) => {
    test.setTimeout(300_000);

    const seen = new Set<string>();
    const queue = [...ENTRY];
    const broken: { url: string; status: number }[] = [];
    const empty: string[] = [];

    while (queue.length) {
      const url = queue.shift()!;
      if (seen.has(url)) continue;
      seen.add(url);

      const res = await page.goto(url, { waitUntil: "domcontentloaded" });
      const status = res?.status() ?? 0;
      if (status >= 400) {
        broken.push({ url, status });
        continue;
      }

      // A page that renders no heading is a dead end even with a 200.
      const headings = await page.locator("h1, h2").count();
      if (headings === 0) empty.push(url);

      for (const href of await internalLinks(page)) {
        if (!seen.has(href) && queue.length < 60) queue.push(href);
      }
    }

    console.log(`crawled ${seen.size} routes`);
    expect(broken, `broken routes: ${JSON.stringify(broken)}`).toEqual([]);
    expect(empty, `routes with no heading: ${JSON.stringify(empty)}`).toEqual([]);
  });

  test("sign in is present and responds on every entry point", async ({ page }) => {
    for (const url of ENTRY) {
      await page.goto(url);
      const signIn = page.getByRole("button", { name: /sign in/i }).first();
      await expect(signIn, `${url} should offer Sign in`).toBeVisible();
      // With no wallet installed, Sign in must explain itself rather than hang.
      await signIn.click();
      await expect(
        page.locator(".wallet-error"),
        `${url} Sign in should report that no wallet was found`,
      ).toBeVisible({ timeout: 15_000 });
    }
  });

  test("every primary call to action leads somewhere real", async ({ page }) => {
    for (const url of ENTRY) {
      await page.goto(url);
      const ctas = page.locator("a.button.primary, a.mh-button");
      const count = await ctas.count();
      for (let i = 0; i < count; i++) {
        const href = await ctas.nth(i).getAttribute("href");
        if (!href || !href.startsWith("/")) continue;
        const res = await page.request.get(href);
        expect(res.status(), `${url} CTA -> ${href}`).toBeLessThan(400);
      }
    }
  });

  test("the marketplace renders without waiting on a live refresh", async ({ page }) => {
    // A visitor must get the market immediately. The snapshot is served from
    // disk; a cold chain scan must never block a page render.
    const started = Date.now();
    await page.goto("/agents", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const elapsed = Date.now() - started;
    console.log(`/agents rendered in ${elapsed}ms`);
    expect(elapsed, "agents index should render promptly from the snapshot").toBeLessThan(15_000);
    await expect(page.getByText(/Availability checked/i)).toBeVisible();
  });
});

import { test, expect, type Page } from "@playwright/test";

// The journey a first-time visitor actually takes:
//   browse -> inspect -> get matched -> activate -> settle -> receipt
//
// Browsing and matching must work with no wallet at all. A wallet is injected
// only at the point the product asks for one, which is what the IA promises.

const BUYER = "0x083b0370F8e8a00D03746cA9A54C5264dDC08124";

// Minimal EIP-1193 provider. wagmi's injected connector needs nothing more than
// this to report a connected account on an already-chosen chain.
async function injectWallet(page: Page) {
  await page.addInitScript((address) => {
    const listeners: Record<string, ((...a: unknown[]) => void)[]> = {};
    const provider = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [address];
          case "eth_chainId":
            return "0x61"; // BSC testnet
          case "net_version":
            return "97";
          case "wallet_switchEthereumChain":
          case "wallet_addEthereumChain":
            return null;
          default:
            return null;
        }
      },
      on: (event: string, cb: (...a: unknown[]) => void) => {
        (listeners[event] ??= []).push(cb);
      },
      removeListener: (event: string, cb: (...a: unknown[]) => void) => {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== cb);
      },
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  }, BUYER);
}

test.describe("marketplace journey", () => {
  test("browsing and matching are public, no wallet needed", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("header")).toBeVisible();
    // Sign in is offered, never forced.
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();

    await page.goto("/agents");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Live inventory is present, not just seeded examples.
    const body = await page.locator("body").innerText();
    expect(body).toMatch(/Brain on BNB|Lending Guardian|Grid|Venus/i);

    // The rest of the public surface renders without an account too.
    for (const url of [
      "/outcomes",
      "/agents/category/rebalancing",
      "/agents/category/grid-trading",
      "/agents/category/yield-optimization",
      "/agents/category/health-factor-monitoring",
    ]) {
      const res = await page.goto(url);
      expect(res?.status(), `${url} should render`).toBeLessThan(400);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("every required category has live supply", async ({ page }) => {
    const res = await page.request.get("/api/live/status");
    expect(res.ok()).toBeTruthy();
    const json = (await res.json()) as {
      agents: { category: string; status: string }[];
    };
    for (const cat of [
      "rebalancing",
      "grid-trading",
      "yield-optimization",
      "health-factor-monitoring",
    ]) {
      const live = json.agents.filter((a) => a.category === cat && a.status !== "offline");
      expect(live.length, `${cat} must have callable supply`).toBeGreaterThan(0);
    }
  });

  test("agent detail shows live provenance and onchain identity", async ({ page }) => {
    const res = await page.request.get("/api/live/status");
    const json = (await res.json()) as { agents: { id: string; status: string }[] };
    const agent = json.agents.find((a) => a.status === "available")!;
    await page.goto(`/agents/${agent.id}`);
    await expect(page.locator(".eyebrow").first()).toContainText(/LIVE ONCHAIN AGENT/i);
    await page.locator("details.onchain summary").click();
    await expect(page.locator("details.onchain")).toContainText(/ERC-8004 identity/i);
  });

  test("guided matching reaches a reviewable setup", async ({ page }) => {
    await page.goto("/find/goal");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Walk the four question steps using the flow's own Continue control.
    for (const step of ["goal", "context", "risk", "control"]) {
      await expect(page).toHaveURL(new RegExp(`/find/${step}`));
      await page.getByRole("button", { name: /continue|show my matches/i }).click();
    }

    // Matches are computed and reviewable without any wallet.
    await expect(page).toHaveURL(/\/find\/recommendations/);
    const review = page.locator("a.button.primary[href*='/outcomes/create']").first();
    await expect(review).toBeVisible();
    await review.click();
    await expect(page).toHaveURL(/\/outcomes\/create/);
    await expect(page.getByRole("heading", { name: /review your setup/i })).toBeVisible();
  });

  test("activation asks for a wallet, then settles onchain and yields a receipt", async ({
    page,
  }) => {
    test.setTimeout(600_000);

    // Pick an agent whose hire can complete right now. Free agents are strongly
    // preferred: a paid hire escrows real value on mainnet, and a test suite
    // must not spend money every time it runs. Set E2E_ALLOW_PAID=1 to include
    // paid agents deliberately.
    const allowPaid = process.env.E2E_ALLOW_PAID === "1";
    const res = await page.request.get("/api/live/status");
    const json = (await res.json()) as { agents: { id: string; status: string; category: string }[] };
    let agent: { id: string } | undefined;
    let paidFallback: { id: string } | undefined;
    for (const a of json.agents.filter((x) => x.status === "available")) {
      const pre = await page.request.get(`/api/hire/preflight?agentId=${a.id}`);
      const p = (await pre.json()) as { canHire?: boolean; mode?: string };
      if (!p.canHire) continue;
      if (p.mode === "free") {
        agent = a;
        break;
      }
      paidFallback ??= a;
    }
    if (!agent && allowPaid) agent = paidFallback;
    test.skip(
      !agent,
      "no free agent is answering; set E2E_ALLOW_PAID=1 to exercise a paid hire, which spends real value",
    );
    const hireable = agent!;

    // Without a wallet, activation is gated but the page still renders.
    await page.goto(`/agents/${hireable.id}`);
    await expect(page.getByText(/SIGN IN TO ACTIVATE/i)).toBeVisible();

    // Now bring a wallet, exactly when the onchain action needs it.
    await injectWallet(page);
    await page.goto(`/agents/${hireable.id}`);
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(
      page.getByRole("button", { name: /activate and escrow|get this result/i }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: /activate and escrow|get this result/i }).click();
    // Escrow takes several onchain transactions.
    // The receipt panel is the proof: it carries the agent's actual output.
    await expect(page.locator(".deliverable")).toBeVisible({ timeout: 300_000 });
    await expect(
      page.getByText(/SETTLED ONCHAIN|DELIVERED|ESCROW/i).first(),
    ).toBeVisible();

    // Reopen the app cold and find the result again: this is what a returning
    // visitor actually does, and it must survive a full page load.
    await page.goto("/my-outcomes");
    await expect(page.getByText(/Your activity/i)).toBeVisible({ timeout: 30_000 });
    const row = page.locator("a.saved-row[href*='/my-outcomes/']").first();
    await expect(row).toBeVisible();
    await row.click();

    await expect(page).toHaveURL(/\/my-outcomes\/(job|free)-/);
    await expect(page.locator(".deliverable")).toBeVisible({ timeout: 30_000 });
    // A paid hire shows its onchain trail; a free read has no job to show.
    if (page.url().includes("/job-")) {
      await expect(page.getByText(/Onchain settlement/i)).toBeVisible();
    }
  });

  test("my outcomes lists receipts for the connected account", async ({ page }) => {
    await injectWallet(page);
    await page.goto("/my-outcomes");
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.getByText(/Your activity|Your saved setups/i).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});

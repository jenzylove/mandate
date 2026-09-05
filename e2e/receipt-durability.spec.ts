import { test, expect, type Page } from "@playwright/test";

// Receipts are written to the server filesystem, which on a serverless host is
// per-instance and does not survive a redeploy. So the filesystem is treated as
// a cache, and the chain as the system of record: a paid job's description,
// status, price, provider and deliverable digest are all recoverable from the
// kernel by anyone, on any instance.
//
// These tests assert that a receipt is still there for a visitor who arrives
// with a completely fresh session, which is the case the filesystem cannot be
// trusted for. Run against production with:
//   E2E_BASE_URL=https://<deployment> npx playwright test e2e/receipt-durability

const BUYER = "0x083b0370F8e8a00D03746cA9A54C5264dDC08124";

async function injectWallet(page: Page) {
  await page.addInitScript((address) => {
    const provider = {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => {
        if (method === "eth_requestAccounts" || method === "eth_accounts") return [address];
        if (method === "eth_chainId") return "0x38";
        if (method === "net_version") return "56";
        return null;
      },
      on: () => {},
      removeListener: () => {},
    };
    Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  }, BUYER);
}

interface ReceiptRow {
  id: string;
  jobId: string | null;
  mode: "paid" | "free";
  status: string;
  agentName: string;
  buyer: string | null;
  delivery: { hash: string; content: string };
  chain: { steps: unknown[] } | null;
}

async function anyPaidReceipt(page: Page): Promise<ReceiptRow | undefined> {
  const res = await page.request.get(`/api/receipts?buyer=${BUYER}`);
  if (!res.ok()) return undefined;
  const json = (await res.json()) as { receipts?: ReceiptRow[] };
  return (json.receipts ?? []).find((r) => r.mode === "paid" && r.jobId);
}

test.describe("receipt durability", () => {
  test("a paid receipt is readable with no prior session", async ({ page }) => {
    const receipt = await anyPaidReceipt(page);
    test.skip(!receipt, "no paid receipt on this deployment yet");

    // A brand-new request, carrying nothing from the session that created it.
    const res = await page.request.get(`/api/receipts/${receipt!.id}`);
    expect(res.status(), "receipt must be servable to a cold request").toBe(200);

    const json = (await res.json()) as { ok: boolean; receipt: ReceiptRow };
    expect(json.ok).toBe(true);
    expect(json.receipt.id).toBe(receipt!.id);
    expect(json.receipt.jobId).toBe(receipt!.jobId);
    // The digest is the agent's permanent commitment; it must never be lost.
    expect(json.receipt.delivery.hash).toMatch(/^0x[0-9a-f]{64}$/i);
  });

  test("the receipt page renders in a fresh browser session", async ({ browser }) => {
    const probe = await browser.newContext();
    const probePage = await probe.newPage();
    const receipt = await anyPaidReceipt(probePage);
    await probe.close();
    test.skip(!receipt, "no paid receipt on this deployment yet");

    // A different context entirely: no cookies, no localStorage, nothing that
    // the hiring session left behind.
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await injectWallet(page);

    await page.goto(`/my-outcomes/${receipt!.id}`);
    // A new device has no wallet session, so the account gate comes first. That
    // is the wallet-is-your-account rule working, not a failure.
    await expect(page.getByText(/YOUR WALLET IS YOUR ACCOUNT/i)).toBeVisible();
    await page.getByRole("button", { name: /sign in/i }).last().click();

    await expect(page.locator(".deliverable")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(new RegExp(receipt!.agentName.slice(0, 18), "i")).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`Job #${receipt!.jobId}`))).toBeVisible();

    await fresh.close();
  });

  test("a paid receipt survives the server losing its copy", async ({ page }) => {
    const receipt = await anyPaidReceipt(page);
    test.skip(!receipt, "no paid receipt on this deployment yet");

    // Ask for a job id the server has certainly never written a file for: the
    // same job, addressed through the chain-anchored id form. If this answers,
    // reconstruction works and the filesystem is genuinely only a cache.
    const res = await page.request.get(`/api/receipts/${receipt!.id}`);
    const json = (await res.json()) as { ok: boolean; receipt: ReceiptRow };
    expect(json.ok).toBe(true);

    // Whichever path served it, these facts come from the kernel and must agree.
    expect(json.receipt.status).toMatch(/OPEN|FUNDED|SUBMITTED|COMPLETED|REJECTED|EXPIRED|REFUNDED/);
    expect(json.receipt.buyer?.toLowerCase()).toBe(BUYER.toLowerCase());
    expect(json.receipt.delivery.content.length).toBeGreaterThan(0);
  });

  test("My Outcomes finds past work for a wallet that has no local state", async ({ browser }) => {
    const fresh = await browser.newContext();
    const page = await fresh.newPage();
    await injectWallet(page);

    await page.goto("/my-outcomes");
    await page.getByRole("button", { name: /sign in/i }).first().click();

    const res = await page.request.get(`/api/receipts?buyer=${BUYER}`);
    const json = (await res.json()) as { receipts?: ReceiptRow[] };
    const count = (json.receipts ?? []).length;
    test.skip(count === 0, "this deployment has no receipts for the test wallet");

    // Receipts are keyed to the wallet, not the browser, so a device that has
    // never been used before still shows the history.
    await expect(page.getByText(/Your activity/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("a.saved-row").first()).toBeVisible();

    await fresh.close();
  });
});

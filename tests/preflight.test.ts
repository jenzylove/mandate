import { describe, expect, it, vi } from "vitest";

const { negotiateMock } = vi.hoisted(() => ({ negotiateMock: vi.fn() }));

vi.mock("@/lib/commerce/negotiate", () => ({ negotiateHire: negotiateMock }));
vi.mock("@/lib/settlement/erc8183", () => ({ settlementFor: vi.fn(), escrowAddress: vi.fn() }));

describe("preflight candidate orchestration", () => {
  it("falls through to the next current candidate after a live failure", async () => {
    negotiateMock
      .mockResolvedValueOnce({
        status: "unavailable",
        mode: "paid",
        agent: { id: "live-first", name: "First" },
        route: null,
        missingFields: [],
        checkedAt: new Date().toISOString(),
        reason: "provider endpoint failed",
      })
      .mockResolvedValueOnce({
        status: "ready",
        mode: "free",
        agent: { id: "live-second", name: "Second" },
        route: { kind: "MCP", endpoint: "https://second.example/mcp" },
        quote: { accepted: true, priceRaw: "0", service: "preview", deliverables: "ok", raw: {} },
        missingFields: [],
        checkedAt: new Date().toISOString(),
        reason: "free result",
      });
    const { POST } = await import("@/app/api/hire/preflight/route");
    const response = await POST(new Request("http://localhost/api/hire/preflight", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "live-first",
        candidateAgentIds: ["live-second"],
        context: { asset: "USDC", outcomeId: "protect-and-earn" },
      }),
    }));
    const json = await response.json();
    expect(json.agentId).toBe("live-second");
    expect(json.canHire).toBe(true);
    expect(negotiateMock).toHaveBeenNthCalledWith(1, "live-first", expect.objectContaining({ asset: "USDC" }));
    expect(negotiateMock).toHaveBeenNthCalledWith(2, "live-second", expect.objectContaining({ asset: "USDC" }));
  });
});

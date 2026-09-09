import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveAgent } from "@/lib/live/qualify";
import { negotiateHire, quoteFingerprint } from "@/lib/commerce/negotiate";

const { liveAgentMock, quoteMock, resolveRouteMock } = vi.hoisted(() => ({
  liveAgentMock: vi.fn(),
  quoteMock: vi.fn(),
  resolveRouteMock: vi.fn(),
}));

vi.mock("@/lib/live/snapshot", () => ({ liveAgent: liveAgentMock }));
vi.mock("@/lib/live/agent-adapter", () => ({
  quote: quoteMock,
  resolveCallableRoute: resolveRouteMock,
}));

const agent = (quote: LiveAgent["live"]["quote"]): LiveAgent => ({
  id: "live-341628",
  name: "IVL Rebalancer",
  description: "Read-only rebalance preview.",
  owner: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
  category: "rebalancing",
  capabilities: ["preview"],
  protocols: ["PancakeSwap"],
  assets: ["BNB", "USDT", "USDC"],
  networks: ["BNB Smart Chain"],
  reputation: 80,
  metrics: [],
  status: "available",
  pricing: "Quote on hire",
  verification: "live",
  hireable: false,
  endpoint: "https://ivl.example/.well-known/agent-card.json",
  source: "erc8004",
  supportedControlModes: ["monitor", "ask"],
  evidence: { provenance: "live", metrics: [] },
  live: {
    agentId: "341628",
    network: "bsc-mainnet",
    registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    explorerUrl: "https://bscscan.com",
    routes: [{ kind: "A2A", endpoint: "https://ivl.example/.well-known/agent-card.json" }],
    route: { kind: "A2A", endpoint: "https://ivl.example/.well-known/agent-card.json" },
    probe: { ok: true, detail: "agent card serves 3 skills", skills: ["negotiate", "preview"], checkedAt: new Date().toISOString() },
    quote,
    refreshedAt: new Date().toISOString(),
  },
});

describe("canonical live negotiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRouteMock.mockImplementation(async (route) => ({ ...route, endpoint: "https://ivl.example" }));
    liveAgentMock.mockResolvedValue(agent({
      accepted: false,
      priceRaw: "1000000000000000000",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
    }));
  });

  it("uses a fresh live quote even when the snapshot has no accepted quote", async () => {
    quoteMock.mockResolvedValue({
      accepted: true,
      priceRaw: "1000000000000000000",
      priceDisplay: "1 USDT",
      currency: "0x55d398326f99059fF775485246999027B3197955",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
      chainId: 56,
      verifyingContract: "0xea4daa3100a767e86fded867729ae7446476eba6",
      paymentToken: "0x55d398326f99059fF775485246999027B3197955",
      negotiationHash: "0xnegotiated",
      raw: {},
    });
    const result = await negotiateHire("live-341628", {
      buyer: "0x1111111111111111111111111111111111111111",
      pair: "BNB/USDC",
      asset: "USDC",
      protocol: "PancakeSwap",
      outcomeId: "protect-and-earn",
      request: "Return a live rebalance decision",
    }, { checkSettlement: false, resolveProvider: async (_agent, q) => q.provider });

    expect(result.status).toBe("ready");
    expect(result.quote?.priceRaw).toBe("1000000000000000000");
    expect(quoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://ivl.example" }),
      "Return a live rebalance decision",
      undefined,
      expect.objectContaining({
        task_description: "Return a live rebalance decision",
        quality_standards: expect.any(String),
        wallet: "0x1111111111111111111111111111111111111111",
        pair: "BNB/USDC",
        outcomeId: "protect-and-earn",
      }),
    );
  });

  it("auto-fills known needs and returns only genuinely missing fields", async () => {
    quoteMock.mockResolvedValueOnce({
      accepted: false,
      needs: { wallet: "Wallet address", pair: "Token pair" },
      raw: {},
    }).mockResolvedValueOnce({
      accepted: true,
      priceRaw: "100",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
      chainId: 56,
      raw: {},
    });

    const first = await negotiateHire("live-341628", {
      buyer: "0x1111111111111111111111111111111111111111",
      request: "Rebalance my position",
    }, { checkSettlement: false, resolveProvider: async (_agent, q) => q.provider });
    expect(first.status).toBe("needs-input");
    expect(first.missingFields).toEqual([{ key: "pair", label: "Token pair", type: "text" }]);

    const second = await negotiateHire("live-341628", {
      buyer: "0x1111111111111111111111111111111111111111",
      pair: "BNB/USDC",
      request: "Rebalance my position",
    }, { checkSettlement: false, resolveProvider: async (_agent, q) => q.provider });
    expect(second.status).toBe("ready");
    expect(quoteMock).toHaveBeenCalledTimes(2);
  });

  it("does not reuse a stale cached price", async () => {
    quoteMock.mockResolvedValue({
      accepted: true,
      priceRaw: "250",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
      chainId: 56,
      raw: {},
    });
    const result = await negotiateHire("live-341628", { request: "Fresh work" }, {
      checkSettlement: false,
      resolveProvider: async (_agent, q) => q.provider,
    });
    expect(result.quote?.priceRaw).toBe("250");
    expect(result.quote?.priceRaw).not.toBe("1000000000000000000");
  });

  it("rejects a paid quote without a valid provider", async () => {
    quoteMock.mockResolvedValue({ accepted: true, priceRaw: "100", raw: {} });
    const result = await negotiateHire("live-341628", {}, {
      checkSettlement: false,
      resolveProvider: async () => undefined,
    });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toMatch(/provider payout address/);
  });

  it("rejects a quote bound to a different ERC-8183 verifier", async () => {
    quoteMock.mockResolvedValue({
      accepted: true,
      priceRaw: "100",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
      chainId: 56,
      verifyingContract: "0x2222222222222222222222222222222222222222",
      raw: {},
    });
    const result = await negotiateHire("live-341628", {}, { checkSettlement: true });
    expect(result.status).toBe("unavailable");
    expect(result.reason).toMatch(/verifying contract/);
  });

  it("recognises a callable free result as free commerce", async () => {
    quoteMock.mockResolvedValue({
      accepted: true,
      priceRaw: "0",
      service: "preview",
      deliverables: "{\"decision\":\"hold\"}",
      raw: {},
    });
    const result = await negotiateHire("live-341628", {}, { checkSettlement: false });
    expect(result.status).toBe("ready");
    expect(result.mode).toBe("free");
  });

  it("does not ask the user for fields the agent explicitly marks optional", async () => {
    quoteMock.mockResolvedValue({
      accepted: true,
      priceRaw: "100",
      provider: "0x6D19d43fC2cd226B135ED5f9F82b366AC864b703",
      needs: { amountUsd: "position size, optional" },
      raw: {},
    });
    const result = await negotiateHire("live-341628", {}, { checkSettlement: false });
    expect(result.status).toBe("ready");
    expect(result.missingFields).toEqual([]);
  });

  it("fingerprints all terms that must remain stable before funding", () => {
    expect(quoteFingerprint({ accepted: true, priceRaw: "1", provider: "0xAA", chainId: 56, currency: "U", raw: {} }))
      .not.toBe(quoteFingerprint({ accepted: true, priceRaw: "2", provider: "0xAA", chainId: 56, currency: "U", raw: {} }));
    expect(quoteFingerprint(undefined)).toBe("");
  });
});

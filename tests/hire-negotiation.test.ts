import { describe, expect, it, vi } from "vitest";

const { liveAgentMock, negotiateMock, fingerprintMock, TermsChanged, NeedsInput } = vi.hoisted(() => {
  class TermsChanged extends Error {
    result: unknown;
    constructor(result: unknown) {
      super("terms changed");
      this.result = result;
    }
  }
  class NeedsInput extends Error {
    result: unknown;
    constructor(result: unknown) {
      super("needs input");
      this.result = result;
    }
  }
  return {
    liveAgentMock: vi.fn(),
    negotiateMock: vi.fn(),
    fingerprintMock: vi.fn((quote: { priceRaw?: string; provider?: string } | undefined) => quote ? `${quote.priceRaw}|${quote.provider}` : ""),
    TermsChanged,
    NeedsInput,
  };
});

vi.mock("@/lib/live/snapshot", () => ({ liveAgent: liveAgentMock }));
vi.mock("@/lib/commerce/negotiate", () => ({
  negotiateHire: negotiateMock,
  quoteFingerprint: fingerprintMock,
  TermsChangedError: TermsChanged,
  NegotiationRequiredError: NeedsInput,
}));
vi.mock("@/lib/live/agent-adapter", () => ({ callTool: vi.fn(), notifyFunded: vi.fn() }));
vi.mock("@/lib/settlement/erc8183", () => ({ settlementFor: vi.fn(), escrowAddress: vi.fn(() => "0xescrow") }));
vi.mock("@/lib/settlement/receipt-store", () => ({
  writeToStore: vi.fn(),
  readFromStore: vi.fn(),
  listFromStore: vi.fn(),
  reconstructFromChain: vi.fn(),
  listFromChain: vi.fn(),
}));
vi.mock("@/lib/audit/mandate-audit", () => ({ auditSubmission: vi.fn() }));

const selectedAgent = {
  id: "live-341628",
  name: "IVL Rebalancer",
  category: "rebalancing",
  live: { agentId: "341628", network: "bsc-mainnet" },
};

describe("final hire negotiation gate", () => {
  it("uses the canonical engine and refuses to fund changed terms", async () => {
    liveAgentMock.mockResolvedValue(selectedAgent);
    const fresh = {
      status: "ready",
      mode: "paid",
      agent: selectedAgent,
      route: { kind: "A2A", endpoint: "https://agent.example" },
      provider: "0x1111111111111111111111111111111111111111",
      network: "bsc-mainnet",
      quote: { accepted: true, priceRaw: "200", provider: "0x1111111111111111111111111111111111111111", raw: {} },
      missingFields: [],
      checkedAt: new Date().toISOString(),
    };
    negotiateMock.mockResolvedValue(fresh);
    const { hire } = await import("@/lib/settlement/hire");

    await expect(hire({
      agentId: "live-341628",
      request: "Rebalance BNB/USDC",
      expectedQuote: { accepted: true, priceRaw: "100", provider: "0x1111111111111111111111111111111111111111", raw: {} },
    })).rejects.toBeInstanceOf(TermsChanged);
    expect(negotiateMock).toHaveBeenCalledTimes(1);
  });

  it("returns the same structured missing-input state instead of creating a job", async () => {
    liveAgentMock.mockResolvedValue(selectedAgent);
    negotiateMock.mockResolvedValue({
      status: "needs-input",
      mode: "paid",
      agent: selectedAgent,
      route: { kind: "A2A", endpoint: "https://agent.example" },
      missingFields: [{ key: "pair", label: "Token pair", type: "text" }],
      checkedAt: new Date().toISOString(),
      reason: "pair required",
    });
    const { hire } = await import("@/lib/settlement/hire");
    await expect(hire({ agentId: "live-341628", context: { buyer: "0x1111111111111111111111111111111111111111" } }))
      .rejects.toBeInstanceOf(NeedsInput);
    expect(negotiateMock).toHaveBeenCalledWith("live-341628", expect.objectContaining({ buyer: "0x1111111111111111111111111111111111111111" }));
  });
});

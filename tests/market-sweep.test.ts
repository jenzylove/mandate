import { describe, it, expect } from "vitest";
import { hireabilityOf, interleaveByOperator } from "@/lib/live/market-sweep";
import type { LiveAgent } from "@/lib/live/qualify";

// The two rules that decide what reaches a buyer: whether Mandate proved it can
// transact with an agent, and whether one operator gets to own the top of the
// catalogue.

type QuoteShape = NonNullable<LiveAgent["live"]["quote"]>;

const agent = (over: {
  id?: string;
  owner?: string;
  quote?: Partial<QuoteShape>;
  status?: LiveAgent["status"];
}): LiveAgent =>
  ({
    id: `live-${over.id ?? "1"}`,
    name: `Agent ${over.id ?? "1"}`,
    description: "",
    owner: over.owner ?? "0xoperator",
    category: "yield-optimization",
    capabilities: [],
    protocols: [],
    assets: [],
    networks: [],
    reputation: 50,
    metrics: [],
    status: over.status ?? "available",
    pricing: "",
    source: "erc8004",
    supportedControlModes: ["monitor"],
    evidence: { provenance: "live", metrics: [] },
    live: {
      agentId: over.id ?? "1",
      network: "bsc-mainnet",
      registry: "0x",
      explorerUrl: "",
      routes: [],
      route: null,
      probe: { ok: true, detail: "", checkedAt: new Date().toISOString() },
      quote: over.quote as QuoteShape | undefined,
      refreshedAt: new Date().toISOString(),
    },
  }) as LiveAgent;

describe("hireability", () => {
  it("counts a quote with a price and a payout address as paid", () => {
    expect(
      hireabilityOf(agent({ quote: { accepted: true, priceRaw: "100000000000000000", provider: "0xabc" } })),
    ).toBe("paid");
  });

  it("refuses a quote with no payout address, which cannot be escrowed against", () => {
    expect(hireabilityOf(agent({ quote: { accepted: true, priceRaw: "100000000000000000" } }))).toBe(
      "unproven",
    );
  });

  it("refuses a quote whose price is zero but proves no output", () => {
    expect(hireabilityOf(agent({ quote: { accepted: true, priceRaw: "0" } }))).toBe("unproven");
  });

  it("counts a zero price with proven deliverables as free", () => {
    expect(
      hireabilityOf(agent({ quote: { accepted: true, priceRaw: "0", deliverables: "returned 412 characters" } })),
    ).toBe("free");
  });

  it("refuses an agent that merely answered", () => {
    expect(hireabilityOf(agent({}))).toBe("unproven");
    expect(hireabilityOf(agent({ quote: { accepted: false } }))).toBe("unproven");
  });
});

describe("operator interleaving", () => {
  it("does not let one operator hold consecutive top positions", () => {
    const many = [
      ...["a1", "a2", "a3", "a4", "a5"].map((id) => agent({ id, owner: "0xbig" })),
      agent({ id: "b1", owner: "0xsecond" }),
      agent({ id: "c1", owner: "0xthird" }),
    ];
    const ordered = interleaveByOperator(many);
    const topThree = ordered.slice(0, 3).map((a) => a.owner);
    expect(new Set(topThree).size, "the first three should be three operators").toBe(3);
  });

  it("keeps every agent, including an operator's extra services", () => {
    const many = [
      ...["a1", "a2", "a3"].map((id) => agent({ id, owner: "0xbig" })),
      agent({ id: "b1", owner: "0xsecond" }),
    ];
    const ordered = interleaveByOperator(many);
    expect(ordered).toHaveLength(4);
    expect(new Set(ordered.map((a) => a.id)).size).toBe(4);
  });

  it("leads with an agent that is answering over one that is not", () => {
    const ordered = interleaveByOperator([
      agent({ id: "off", owner: "0xa", status: "offline" }),
      agent({ id: "on", owner: "0xb", status: "available" }),
    ]);
    expect(ordered[0].id).toBe("live-on");
  });

  it("survives an empty market", () => {
    expect(interleaveByOperator([])).toEqual([]);
  });
});

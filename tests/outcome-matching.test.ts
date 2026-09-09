import { describe, expect, it } from "vitest";
import { recommend } from "@/lib/engine/recommend";
import { recommendationIsReviewable } from "@/lib/engine/matching";
import type { Agent, Outcome, OutcomeQuery } from "@/lib/domain/types";

const base = (overrides: Partial<Agent>): Agent => ({
  id: "agent", name: "Agent", description: "Agent", owner: "0x1", category: "yield-optimization",
  capabilities: ["yield-optimization"], protocols: ["Venus"], assets: ["USDC"], networks: ["BNB Smart Chain"],
  reputation: 70, metrics: [], status: "available", pricing: "Free", hireable: true, source: "live",
  supportedControlModes: ["ask"], evidence: { provenance: "live", metrics: [] }, ...overrides,
});
const outcome: Outcome = { id: "yield", name: "Yield", description: "Yield", goalType: "earn", requiredRoles: [{ role: "Yield", category: "yield-optimization", requiredCapabilities: ["yield-optimization"] }], supportedProtocols: ["Venus"], supportedAssets: ["USDC"], riskLevel: "balanced", evidence: { provenance: "live", metrics: [] }, featured: true };
const query: OutcomeQuery = { goalType: "earn", protocol: "Venus", asset: "USDC", risk: "balanced", control: "ask" };

describe("production Outcome matching", () => {
  it("rejects seeded agents", () => {
    expect(recommend({ query, outcome, agents: [base({ source: "seed" })] })).toEqual([]);
  });
  it("returns only reviewable current hireable agents", () => {
    const agent = base({ id: "live-1" });
    const [result] = recommend({ query, outcome, agents: [agent, base({ id: "offline", status: "offline" })] });
    expect(result).toBeTruthy();
    expect(recommendationIsReviewable([agent], outcome, query, result.agents)).toBe(true);
  });
});

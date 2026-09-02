import { describe, it, expect } from "vitest";
import { JsonAdapter } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import { computeFit } from "@/lib/engine/scoring";
import type { OutcomeQuery } from "@/lib/domain/types";

const adapter = new JsonAdapter();

async function ctx(id: string) {
  const outcome = await adapter.getOutcome(id);
  const agents = await adapter.listAgents();
  if (!outcome) throw new Error(`missing outcome ${id}`);
  return { outcome, agents };
}

const protectQuery: OutcomeQuery = {
  goalType: "combine",
  protocol: "Venus",
  asset: "USDT",
  risk: "balanced",
  control: "ask",
  timeframeDays: 30,
};

describe("recommendation engine", () => {
  it("is deterministic: identical input yields identical output", async () => {
    const { outcome, agents } = await ctx("protect-and-earn");
    const a = recommend({ query: protectQuery, outcome, agents });
    const b = recommend({ query: protectQuery, outcome, agents });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("fills every required role in each returned setup", async () => {
    const { outcome, agents } = await ctx("protect-and-earn");
    const recs = recommend({ query: protectQuery, outcome, agents });
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      expect(r.agents.length).toBe(outcome.requiredRoles.length);
    }
  });

  it("assigns the right category agent to each role", async () => {
    const { outcome, agents } = await ctx("protect-and-earn");
    const recs = recommend({ query: protectQuery, outcome, agents });
    const byId = new Map(agents.map((a) => [a.id, a]));
    for (const r of recs) {
      for (const ra of r.agents) {
        const role = outcome.requiredRoles.find((x) => x.role === ra.role);
        expect(byId.get(ra.agentId)!.category).toBe(role!.category);
      }
    }
  });

  it("respects the availability gate (never picks an offline agent)", async () => {
    const { outcome, agents } = await ctx("trade-with-guardrails");
    const q: OutcomeQuery = { goalType: "trade", risk: "aggressive", control: "ask" };
    const recs = recommend({ query: q, outcome, agents });
    const byId = new Map(agents.map((a) => [a.id, a]));
    for (const r of recs)
      for (const ra of r.agents)
        expect(byId.get(ra.agentId)!.status).not.toBe("offline");
  });

  it("respects the control-mode gate", async () => {
    const { outcome, agents } = await ctx("stablecoin-yield");
    // 'monitor' is only supported by the conservative yield agent.
    const q: OutcomeQuery = {
      goalType: "earn",
      protocol: "Venus",
      asset: "USDT",
      risk: "conservative",
      control: "monitor",
    };
    const recs = recommend({ query: q, outcome, agents });
    const byId = new Map(agents.map((a) => [a.id, a]));
    for (const r of recs)
      for (const ra of r.agents)
        expect(byId.get(ra.agentId)!.supportedControlModes).toContain("monitor");
  });

  it("differentiates safe vs aggressive picks where the pool allows", async () => {
    const { outcome, agents } = await ctx("trade-with-guardrails");
    const q: OutcomeQuery = { goalType: "trade", risk: "balanced", control: "ask" };
    const recs = recommend({ query: q, outcome, agents });
    const safe = recs.find((r) => r.mode === "safe");
    const aggressive = recs.find((r) => r.mode === "aggressive");
    // If both modes survived dedup, their agent sets should differ.
    if (safe && aggressive) {
      expect(safe.agents.map((a) => a.agentId).join()).not.toBe(
        aggressive.agents.map((a) => a.agentId).join(),
      );
    }
  });

  it("exposes reasons and a 0..100 fit score", async () => {
    const { outcome, agents } = await ctx("protect-and-earn");
    const recs = recommend({ query: protectQuery, outcome, agents });
    for (const r of recs) {
      expect(r.fitScore).toBeGreaterThanOrEqual(0);
      expect(r.fitScore).toBeLessThanOrEqual(100);
      expect(r.reasons.length).toBeGreaterThan(0);
    }
  });
});

describe("fit scoring", () => {
  it("scores a matching agent higher than a mismatched one", async () => {
    const agents = await adapter.listAgents();
    const guardian = agents.find((a) => a.id === "guardian")!;
    const match = computeFit(guardian, protectQuery).score;
    const mismatch = computeFit(guardian, {
      goalType: "trade",
      protocol: "PancakeSwap",
      asset: "CAKE",
      risk: "aggressive",
      control: "ask",
    }).score;
    expect(match).toBeGreaterThan(mismatch);
  });
});

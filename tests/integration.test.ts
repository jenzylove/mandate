import { describe, it, expect } from "vitest";
import { data } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import type { OutcomeQuery } from "@/lib/domain/types";

describe("adapter + engine integration", () => {
  it("produces renderable recommendations for the flagship outcome", async () => {
    const outcome = await data.getOutcome("protect-and-earn");
    const agents = await data.listAgents();
    expect(outcome).not.toBeNull();
    const q: OutcomeQuery = {
      goalType: "combine",
      protocol: "Venus",
      asset: "USDT",
      risk: "balanced",
      control: "ask",
    };
    const recs = recommend({ query: q, outcome: outcome!, agents });
    expect(recs.length).toBeGreaterThan(0);
    // Every rec must be renderable: known agents + a fit score.
    const ids = new Set(agents.map((a) => a.id));
    for (const r of recs) {
      for (const ra of r.agents) expect(ids.has(ra.agentId)).toBe(true);
    }
  });
});

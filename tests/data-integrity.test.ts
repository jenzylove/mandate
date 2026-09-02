import { describe, it, expect } from "vitest";
import { JsonAdapter } from "@/lib/data/json-adapter";
import { REQUIRED_CATEGORIES, type Provenance } from "@/lib/domain/types";

const adapter = new JsonAdapter();
const VALID_PROVENANCE: Provenance[] = ["live", "historical", "demo", "unavailable"];

describe("seed data integrity", () => {
  it("has unique agent ids", async () => {
    const agents = await adapter.listAgents();
    const ids = agents.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique outcome ids", async () => {
    const outcomes = await adapter.listOutcomes();
    const ids = outcomes.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("populates every required category with at least one agent", async () => {
    for (const cat of REQUIRED_CATEGORIES) {
      const agents = await adapter.listAgentsByCategory(cat);
      expect(agents.length, `category ${cat} is empty`).toBeGreaterThan(0);
    }
  });

  it("labels every metric with a valid provenance (no unlabeled data)", async () => {
    const agents = await adapter.listAgents();
    for (const a of agents) {
      for (const m of [...a.metrics, ...a.evidence.metrics]) {
        expect(VALID_PROVENANCE).toContain(m.provenance);
      }
    }
  });

  it("every outcome role resolves to an existing agent category", async () => {
    const agents = await adapter.listAgents();
    const outcomes = await adapter.listOutcomes();
    const categories = new Set(agents.map((a) => a.category));
    for (const o of outcomes) {
      for (const r of o.requiredRoles) {
        expect(categories.has(r.category), `no agent for role ${r.role}`).toBe(true);
      }
    }
  });

  it("keeps a plain-language description on every outcome (PRD §9)", async () => {
    const outcomes = await adapter.listOutcomes();
    for (const o of outcomes) {
      expect(o.description.length).toBeGreaterThan(10);
    }
  });
});

describe("adapter behavior", () => {
  it("returns null for a missing agent", async () => {
    expect(await adapter.getAgent("does-not-exist")).toBeNull();
  });
  it("returns only featured outcomes from featuredOutcomes()", async () => {
    const featured = await adapter.featuredOutcomes();
    expect(featured.every((o) => o.featured)).toBe(true);
  });
});

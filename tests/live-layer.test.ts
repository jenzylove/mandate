import { describe, it, expect } from "vitest";
import { classify, bestRoute } from "@/lib/live/discover";
import { ROSTER, rosterFor, rosterEntry } from "@/lib/live/roster";
import { REQUIRED_CATEGORIES } from "@/lib/domain/types";

// The classifier is the part of discovery that has to survive real registration
// files, which disagree with the spec and with each other. Every case below was
// observed on BNB Smart Chain.

describe("ERC-8004 card classifier", () => {
  it("reads endpoints from a services array", () => {
    const routes = classify({
      services: [
        { name: "A2A", endpoint: "https://agent.example/a2a", version: "0.3.0" },
        { name: "MCP", endpoint: "https://agent.example/mcp" },
      ],
    });
    expect(routes.map((r) => r.kind).sort()).toEqual(["A2A", "MCP"]);
  });

  it("absorbs the x402Support / x402support casing split", () => {
    expect(classify({ x402Support: true }).some((r) => r.kind === "x402")).toBe(true);
    expect(classify({ x402support: true }).some((r) => r.kind === "x402")).toBe(true);
  });

  it("absorbs supportedTrust / supportedTrusts pluralisation", () => {
    expect(classify({ supportedTrust: ["erc8183"] }).some((r) => r.kind === "ERC8183")).toBe(true);
    expect(classify({ supportedTrusts: ["ERC-8183"] }).some((r) => r.kind === "ERC8183")).toBe(true);
  });

  it("treats a declared capability with no endpoint as unaddressable", () => {
    const x402 = classify({ x402Support: true }).find((r) => r.kind === "x402");
    expect(x402?.endpoint).toBeNull();
  });

  it("does not invent routes from an empty or malformed card", () => {
    expect(classify(null)).toEqual([]);
    expect(classify({})).toEqual([]);
    expect(classify({ services: [null, 42, "nope"] as unknown[] })).toEqual([]);
  });

  it("ignores endpoint entries with no URL", () => {
    expect(classify({ services: [{ name: "A2A" }] })).toEqual([]);
  });

  it("keeps a web profile distinct from a callable surface", () => {
    const routes = classify({ services: [{ name: "web", endpoint: "https://example.com" }] });
    expect(routes).toHaveLength(1);
    expect(routes[0].kind).toBe("WEB");
  });

  it("prefers the transport that actually executes work", () => {
    const routes = classify({
      services: [
        { name: "web", endpoint: "https://example.com" },
        { name: "MCP", endpoint: "https://example.com/mcp" },
        { name: "A2A", endpoint: "https://example.com/a2a" },
      ],
    });
    expect(bestRoute(routes)?.kind).toBe("A2A");
    expect(bestRoute([])).toBeNull();
  });

  it("does not duplicate a transport declared twice", () => {
    const routes = classify({
      services: [
        { name: "A2A", endpoint: "https://a.example/one" },
        { name: "a2a", endpoint: "https://a.example/two" },
      ],
    });
    expect(routes.filter((r) => r.kind === "A2A")).toHaveLength(1);
  });
});

describe("qualified roster", () => {
  it("covers every required marketplace category", () => {
    for (const category of REQUIRED_CATEGORIES) {
      expect(rosterFor(category).length, `${category} needs candidates`).toBeGreaterThan(0);
    }
  });

  it("carries at least two candidates per category, so one outage is survivable", () => {
    for (const category of REQUIRED_CATEGORIES) {
      expect(rosterFor(category).length).toBeGreaterThanOrEqual(2);
    }
  });

  it("uses numeric onchain ids and no duplicates", () => {
    const ids = ROSTER.map((r) => r.agentId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^\d+$/);
  });

  it("looks up an entry by its onchain id", () => {
    expect(rosterEntry(ROSTER[0].agentId)?.category).toBe(ROSTER[0].category);
    expect(rosterEntry("does-not-exist")).toBeUndefined();
  });

  it("declares protocols and assets for matching", () => {
    for (const r of ROSTER) {
      expect(r.protocols.length).toBeGreaterThan(0);
      expect(r.assets.length).toBeGreaterThan(0);
    }
  });
});

describe("agent skill vocabulary", () => {
  // Not every seller speaks negotiate/notify_funded. Several answer a single
  // named skill and say so in the error, which is supply, not a failure.
  const parse = (message: string) => {
    const m = /this agent has one:\s*"([^"]+)"|available skills?:\s*([^.]+)/i.exec(message);
    if (!m) return [];
    return (m[1] ?? m[2] ?? "")
      .split(/[,\s]+/)
      .map((s) => s.replace(/["'.]/g, "").trim())
      .filter(Boolean);
  };

  it("reads a single offered skill out of a rejection", () => {
    expect(parse('Unknown skill "negotiate". This agent has one: "health_factor".')).toEqual([
      "health_factor",
    ]);
  });

  it("reads a list of offered skills", () => {
    expect(parse("Unknown skill. Available skills: grid_plan, yield_plan.")).toEqual([
      "grid_plan",
      "yield_plan",
    ]);
  });

  it("returns nothing when the error names no skills", () => {
    expect(parse("Internal error")).toEqual([]);
    expect(parse("Unauthorized")).toEqual([]);
  });
});

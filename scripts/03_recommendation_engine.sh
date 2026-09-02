#!/usr/bin/env bash
#
# Milestone 03 — Deterministic recommendation engine
# --------------------------------------------------
# Implements the PRD §22 pipeline and §14 Fit Score as a pure, inspectable
# module (no LLM). Given an OutcomeQuery it produces up to three differentiated
# setups (Safe / Balanced / Aggressive), each with a Fit Score and the reasons
# behind it. Verifies determinism, filtering, and mode differentiation.
#
# Safe to run once from the repo root.

set -euo pipefail
ROOT="$(pwd)"
[[ -d "$ROOT/scripts" ]] || { echo "ERROR: run from repo root." >&2; exit 1; }
[[ -f "$ROOT/src/lib/data/json-adapter.ts" ]] || { echo "ERROR: run milestone 02 first." >&2; exit 1; }

echo "==> Milestone 03: recommendation engine"

# ============================================================================
# Scoring. Kept in its own file so weights are one place and fully inspectable.
# ============================================================================
cat > "$ROOT/src/lib/engine/scoring.ts" <<'EOF'
import type {
  Agent,
  OutcomeQuery,
  RiskLevel,
} from "@/lib/domain/types";

// Fit Score dimensions and weights (PRD §14). Transparent and deterministic.
// Each contributor returns 0..1; the weighted sum is scaled to 0..100.
export const WEIGHTS = {
  protocol: 0.25,
  asset: 0.2,
  risk: 0.2,
  reputation: 0.2,
  reliability: 0.15,
} as const;

// Map an agent's status to a reliability signal in 0..1.
export function reliabilityScore(agent: Agent): number {
  switch (agent.status) {
    case "available":
      return 1;
    case "limited":
      return 0.6;
    case "offline":
      return 0;
  }
}

// How well an agent's risk character matches the requested risk. We infer an
// agent's risk band from its category and reputation stability rather than
// inventing a number: conservative work (monitoring, stable yield) leans safe;
// grid/LP lean higher. This is a heuristic and labeled as such in reasons.
export function agentRiskBand(agent: Agent): RiskLevel {
  if (agent.category === "health-factor-monitoring") return "conservative";
  if (agent.category === "yield-optimization") {
    return agent.id.includes("conservative") ? "conservative" : "balanced";
  }
  if (agent.category === "rebalancing") return "balanced";
  return "aggressive"; // grid-trading
}

function riskMatch(agent: Agent, want: RiskLevel): number {
  const order: RiskLevel[] = ["conservative", "balanced", "aggressive"];
  const dist = Math.abs(order.indexOf(agentRiskBand(agent)) - order.indexOf(want));
  return dist === 0 ? 1 : dist === 1 ? 0.6 : 0.2;
}

export interface FitResult {
  score: number; // 0..100
  reasons: string[];
}

// Produce a Fit Score with human-readable reasons (PRD §14). Reasons are only
// emitted for dimensions that actually contributed, so the UI never shows
// false precision.
export function computeFit(agent: Agent, q: OutcomeQuery): FitResult {
  const reasons: string[] = [];

  const protocolHit = q.protocol
    ? agent.protocols.some((p) => p.toLowerCase() === q.protocol!.toLowerCase())
    : true;
  const protocol = protocolHit ? 1 : 0;
  if (q.protocol && protocolHit) reasons.push(`strong history on ${q.protocol}`);

  const assetHit = q.asset
    ? agent.assets.some((a) => a.toLowerCase() === q.asset!.toLowerCase())
    : true;
  const asset = assetHit ? 1 : 0;
  if (q.asset && assetHit) reasons.push(`supports ${q.asset}`);

  const risk = riskMatch(agent, q.risk);
  if (risk === 1) reasons.push(`matches ${q.risk} risk`);

  const reputation = agent.reputation / 100;
  if (agent.reputation >= 85) reasons.push("high reputation");

  const reliability = reliabilityScore(agent);
  if (reliability === 1) reasons.push("high reliability");

  const raw =
    protocol * WEIGHTS.protocol +
    asset * WEIGHTS.asset +
    risk * WEIGHTS.risk +
    reputation * WEIGHTS.reputation +
    reliability * WEIGHTS.reliability;

  return { score: Math.round(raw * 100), reasons };
}
EOF

# ============================================================================
# The engine: the PRD §22 pipeline, then assembly into Safe/Balanced/Aggressive.
# ============================================================================
cat > "$ROOT/src/lib/engine/recommend.ts" <<'EOF'
import type {
  Agent,
  Outcome,
  OutcomeQuery,
  Recommendation,
  RecommendationMode,
  Category,
} from "@/lib/domain/types";
import { computeFit, agentRiskBand } from "@/lib/engine/scoring";

// PRD §22 pipeline, step by step and inspectable:
//   goal -> required category -> protocol/asset compat -> risk filter
//   -> availability -> reputation/evidence -> fit score
//
// The engine is pure: same inputs always produce the same output. It does not
// read the network, the clock, or any global state.

export interface EngineInput {
  query: OutcomeQuery;
  outcome: Outcome;
  agents: Agent[]; // full candidate pool, typically adapter.listAgents()
}

// Which categories does this outcome need? Taken from its required roles.
function requiredCategories(outcome: Outcome): Category[] {
  return outcome.requiredRoles.map((r) => r.category);
}

// Filter the pool to viable candidates for a single role/category.
function candidatesForCategory(
  agents: Agent[],
  category: Category,
  q: OutcomeQuery,
): Agent[] {
  return agents
    .filter((a) => a.category === category)
    .filter((a) => a.status !== "offline") // availability gate
    .filter((a) =>
      q.protocol
        ? a.protocols.some((p) => p.toLowerCase() === q.protocol!.toLowerCase())
        : true,
    )
    .filter((a) =>
      q.asset
        ? a.assets.some((x) => x.toLowerCase() === q.asset!.toLowerCase())
        : true,
    )
    .filter((a) => a.supportedControlModes.includes(q.control)); // PRD §4/step4
}

// Rank candidates by Fit for the given query.
function rankByFit(agents: Agent[], q: OutcomeQuery): Agent[] {
  return [...agents].sort(
    (a, b) => computeFit(b, q).score - computeFit(a, q).score,
  );
}

// Pick an agent for a mode. Safe biases to the most conservative viable agent;
// Aggressive biases to the highest-fit even if riskier; Balanced takes best fit.
function pickForMode(
  ranked: Agent[],
  mode: RecommendationMode,
): Agent | undefined {
  if (ranked.length === 0) return undefined;
  if (mode === "safe") {
    const conservative = ranked.filter(
      (a) => agentRiskBand(a) === "conservative",
    );
    return (conservative[0] ?? ranked[ranked.length - 1]);
  }
  if (mode === "aggressive") {
    const aggressive = ranked.filter((a) => agentRiskBand(a) === "aggressive");
    return aggressive[0] ?? ranked[0];
  }
  return ranked[0]; // balanced: best fit
}

const MODES: RecommendationMode[] = ["safe", "balanced", "aggressive"];

// Build one recommendation per mode. A mode is only returned if every required
// role can be filled — we never present a half-assembled setup.
export function recommend(input: EngineInput): Recommendation[] {
  const { query, outcome, agents } = input;
  const cats = requiredCategories(outcome);

  const out: Recommendation[] = [];

  for (const mode of MODES) {
    const chosen: { agent: Agent; role: string }[] = [];
    let ok = true;

    for (const role of outcome.requiredRoles) {
      const ranked = rankByFit(
        candidatesForCategory(agents, role.category, query),
        query,
      );
      const pick = pickForMode(ranked, mode);
      if (!pick) {
        ok = false;
        break;
      }
      chosen.push({ agent: pick, role: role.role });
    }

    if (!ok) continue;

    // Aggregate fit + reasons across the chosen agents (dedup reasons).
    const fits = chosen.map((c) => computeFit(c.agent, query));
    const fitScore = Math.round(
      fits.reduce((s, f) => s + f.score, 0) / fits.length,
    );
    const reasons = Array.from(new Set(fits.flatMap((f) => f.reasons)));

    out.push({
      id: `${outcome.id}:${mode}`,
      mode,
      outcomeId: outcome.id,
      agents: chosen.map((c) => ({ agentId: c.agent.id, role: c.role })),
      fitScore,
      reasons,
      evidence: outcome.evidence,
    });
  }

  // Dedup identical setups so we never show three copies of one option when
  // the pool is thin (PRD: "up to three clearly differentiated setups").
  const seen = new Set<string>();
  return out.filter((r) => {
    const sig = r.agents.map((a) => a.agentId).join("|");
    if (seen.has(sig) && r.mode !== "balanced") return false;
    seen.add(sig);
    return true;
  });
}
EOF

cat > "$ROOT/src/lib/engine/index.ts" <<'EOF'
export * from "@/lib/engine/scoring";
export * from "@/lib/engine/recommend";
EOF

# ============================================================================
# Tests: determinism, filtering, mode differentiation, fit-score sanity.
# ============================================================================
cat > "$ROOT/tests/engine.test.ts" <<'EOF'
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
EOF

# --- verification ------------------------------------------------------------
echo "==> Verifying milestone 03"
echo "  - typecheck"
npx tsc --noEmit
echo "  - tests"
npx vitest run
echo "  - all checks passed"

# --- commit ------------------------------------------------------------------
git add -A
if git diff --cached --quiet; then
  echo "  - nothing to commit"
else
  git commit -q -m "Milestone 03: deterministic recommendation engine (PRD §22/§14) + tests"
  echo "  - committed"
fi

echo "==> Milestone 03 complete."
echo "    Next: git push origin main   (then: bash scripts/04_routes_and_wallet.sh)"

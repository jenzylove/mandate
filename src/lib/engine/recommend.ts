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

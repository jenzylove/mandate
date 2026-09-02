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

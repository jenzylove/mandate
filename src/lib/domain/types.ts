// PRD §23 data model, typed. These are the product's nouns. Keep them stable;
// the data adapter and recommendation engine both depend on this contract.

export type Category =
  | "rebalancing"
  | "grid-trading"
  | "yield-optimization"
  | "health-factor-monitoring";

export type GoalType = "earn" | "trade" | "protect" | "manage-liquidity" | "combine";

export type RiskLevel = "conservative" | "balanced" | "aggressive";

export type ControlMode = "monitor" | "ask" | "autopilot";

export type RecommendationMode = "safe" | "balanced" | "aggressive";

// How much a piece of evidence can be trusted. The UI MUST distinguish these
// (PRD §13). Demo data is never presented as live production data.
export type Provenance = "live" | "historical" | "demo" | "unavailable";

export type AgentStatus = "available" | "limited" | "offline";

export interface Metric {
  label: string;
  value: string; // pre-formatted for display; keep raw numbers out of the UI
  provenance: Provenance;
}

export interface Evidence {
  provenance: Provenance;
  windowDays?: number;
  metrics: Metric[];
  note?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  owner: string;
  category: Category;
  capabilities: string[];
  protocols: string[];
  assets: string[];
  networks: string[];
  reputation: number; // 0..100, source-labeled via evidence
  metrics: Metric[];
  status: AgentStatus;
  pricing: string;
  endpoint?: string;
  source: string; // e.g. "8004scan" | "seed"
  supportedControlModes: ControlMode[];
  evidence: Evidence;
}

export interface OutcomeRole {
  role: string; // human-readable, e.g. "Health-factor monitoring"
  category: Category;
  requiredCapabilities: string[];
  assignedAgentId?: string;
}

export interface Outcome {
  id: string;
  name: string;
  description: string; // plain-language, always shown with the name (PRD §9)
  goalType: GoalType;
  requiredRoles: OutcomeRole[];
  supportedProtocols: string[];
  supportedAssets: string[];
  riskLevel: RiskLevel;
  evidence: Evidence;
  featured: boolean;
}

export interface RecommendationAgent {
  agentId: string;
  role: string;
}

export interface Recommendation {
  id: string;
  mode: RecommendationMode;
  outcomeId: string;
  agents: RecommendationAgent[];
  fitScore: number; // 0..100
  reasons: string[]; // exposed to the user (PRD §14)
  evidence: Evidence;
}

export interface OutcomeReceipt {
  id: string;
  outcomeId: string;
  agentIds: string[];
  startedAt: string;
  endedAt?: string;
  objective: string;
  metrics: Metric[];
  success: boolean;
  evidenceUri?: string;
}

// The structured input collected by the outcome flow (PRD §7).
export interface OutcomeQuery {
  goalType: GoalType;
  protocol?: string;
  asset?: string;
  amount?: number;
  risk: RiskLevel;
  control: ControlMode;
  timeframeDays?: number;
}

export const REQUIRED_CATEGORIES: Category[] = [
  "rebalancing",
  "grid-trading",
  "yield-optimization",
  "health-factor-monitoring",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  rebalancing: "Rebalancing",
  "grid-trading": "Grid Trading",
  "yield-optimization": "Yield Optimisation",
  "health-factor-monitoring": "Health-Factor Monitoring",
};

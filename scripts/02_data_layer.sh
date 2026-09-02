#!/usr/bin/env bash
#
# Milestone 02 — Domain model + data layer
# ----------------------------------------
# Writes the PRD data-model types (Agent, Outcome, OutcomeRole, Recommendation,
# OutcomeReceipt + supporting enums), seeds JSON covering the four required
# BNB categories, and builds a DataAdapter interface with a JSON-backed
# implementation. Verifies types compile and adapter/data-integrity tests pass.
#
# Safe to run once from the repo root.

set -euo pipefail
ROOT="$(pwd)"
[[ -d "$ROOT/scripts" ]] || { echo "ERROR: run from repo root." >&2; exit 1; }
[[ -f "$ROOT/package.json" ]] || { echo "ERROR: run milestone 01 first." >&2; exit 1; }

echo "==> Milestone 02: domain model + data layer"

# ============================================================================
# Domain types (PRD §23)
# ============================================================================
cat > "$ROOT/src/lib/domain/types.ts" <<'EOF'
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
EOF

# ============================================================================
# Seeded data. Every metric carries provenance. All seed evidence is "demo".
# Covers ALL FOUR required categories with equal intent (PRD §10).
# ============================================================================
cat > "$ROOT/data/seed/agents.json" <<'EOF'
[
  {
    "id": "guardian",
    "name": "Guardian",
    "description": "Watches a lending position's health factor and steps in before it drifts toward liquidation.",
    "owner": "0xGuardianLabs",
    "category": "health-factor-monitoring",
    "capabilities": ["health-factor-monitoring", "auto-repay", "alerting"],
    "protocols": ["Venus"],
    "assets": ["USDT", "USDC", "BNB"],
    "networks": ["BNB Smart Chain"],
    "reputation": 91,
    "metrics": [
      { "label": "Interventions", "value": "37", "provenance": "demo" },
      { "label": "Liquidations", "value": "0", "provenance": "demo" }
    ],
    "status": "available",
    "pricing": "0.10% of protected capital / mo",
    "source": "seed",
    "supportedControlModes": ["monitor", "ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Min observed HF", "value": "1.78", "provenance": "demo" },
        { "label": "Violations", "value": "0", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  },
  {
    "id": "atlas-yield",
    "name": "Atlas Yield",
    "description": "Routes idle stablecoins to the best available yield within a chosen risk band.",
    "owner": "0xAtlas",
    "category": "yield-optimization",
    "capabilities": ["yield-optimization", "auto-compound", "risk-banding"],
    "protocols": ["Venus", "PancakeSwap"],
    "assets": ["USDT", "USDC"],
    "networks": ["BNB Smart Chain"],
    "reputation": 88,
    "metrics": [
      { "label": "Net yield (30d)", "value": "+7.8%", "provenance": "demo" }
    ],
    "status": "available",
    "pricing": "10% performance fee",
    "source": "seed",
    "supportedControlModes": ["ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Observed net yield", "value": "+7.8%", "provenance": "demo" },
        { "label": "Gas + fees", "value": "0.4%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  },
  {
    "id": "atlas-yield-conservative",
    "name": "Atlas Yield Stable",
    "description": "Conservative variant of Atlas: single-protocol stablecoin yield, no LP exposure.",
    "owner": "0xAtlas",
    "category": "yield-optimization",
    "capabilities": ["yield-optimization", "auto-compound"],
    "protocols": ["Venus"],
    "assets": ["USDT", "USDC"],
    "networks": ["BNB Smart Chain"],
    "reputation": 85,
    "metrics": [
      { "label": "Net yield (30d)", "value": "+4.9%", "provenance": "demo" }
    ],
    "status": "available",
    "pricing": "8% performance fee",
    "source": "seed",
    "supportedControlModes": ["monitor", "ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Observed net yield", "value": "+4.9%", "provenance": "demo" },
        { "label": "Volatility", "value": "low", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  },
  {
    "id": "meridian-lp",
    "name": "Meridian",
    "description": "Keeps a PancakeSwap LP position inside its active range by rebalancing as price moves.",
    "owner": "0xMeridian",
    "category": "rebalancing",
    "capabilities": ["rebalancing", "range-management"],
    "protocols": ["PancakeSwap"],
    "assets": ["BNB", "USDT", "CAKE"],
    "networks": ["BNB Smart Chain"],
    "reputation": 86,
    "metrics": [
      { "label": "Range uptime", "value": "92%", "provenance": "demo" }
    ],
    "status": "available",
    "pricing": "0.15% of managed liquidity / mo",
    "source": "seed",
    "supportedControlModes": ["ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Range uptime", "value": "92%", "provenance": "demo" },
        { "label": "Rebalances", "value": "14", "provenance": "demo" },
        { "label": "Fees earned", "value": "+3.1%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  },
  {
    "id": "lattice-grid",
    "name": "Lattice",
    "description": "Runs a grid trading strategy between defined bounds with a capped risk budget.",
    "owner": "0xLattice",
    "category": "grid-trading",
    "capabilities": ["grid-trading", "risk-cap"],
    "protocols": ["PancakeSwap"],
    "assets": ["BNB", "USDT"],
    "networks": ["BNB Smart Chain"],
    "reputation": 79,
    "metrics": [
      { "label": "Realized PnL (30d)", "value": "+5.2%", "provenance": "demo" }
    ],
    "status": "available",
    "pricing": "12% performance fee",
    "source": "seed",
    "supportedControlModes": ["ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Realized PnL", "value": "+5.2%", "provenance": "demo" },
        { "label": "Max drawdown", "value": "-3.4%", "provenance": "demo" },
        { "label": "Fills", "value": "212", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  },
  {
    "id": "lattice-grid-tight",
    "name": "Lattice Tight",
    "description": "Lower-variance grid: narrower bounds, smaller size, fewer fills.",
    "owner": "0xLattice",
    "category": "grid-trading",
    "capabilities": ["grid-trading", "risk-cap"],
    "protocols": ["PancakeSwap"],
    "assets": ["BNB", "USDT"],
    "networks": ["BNB Smart Chain"],
    "reputation": 81,
    "metrics": [
      { "label": "Realized PnL (30d)", "value": "+2.7%", "provenance": "demo" }
    ],
    "status": "limited",
    "pricing": "10% performance fee",
    "source": "seed",
    "supportedControlModes": ["monitor", "ask", "autopilot"],
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Realized PnL", "value": "+2.7%", "provenance": "demo" },
        { "label": "Max drawdown", "value": "-1.2%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence for hackathon."
    }
  }
]
EOF

cat > "$ROOT/data/seed/outcomes.json" <<'EOF'
[
  {
    "id": "protect-and-earn",
    "name": "Protect & Earn",
    "description": "Protect a Venus lending position while putting idle stablecoins to work.",
    "goalType": "combine",
    "requiredRoles": [
      {
        "role": "Health-factor monitoring",
        "category": "health-factor-monitoring",
        "requiredCapabilities": ["health-factor-monitoring"]
      },
      {
        "role": "Yield optimization",
        "category": "yield-optimization",
        "requiredCapabilities": ["yield-optimization"]
      }
    ],
    "supportedProtocols": ["Venus"],
    "supportedAssets": ["USDT", "USDC"],
    "riskLevel": "balanced",
    "featured": true,
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Target success", "value": "94%", "provenance": "demo" },
        { "label": "Violations", "value": "0", "provenance": "demo" },
        { "label": "Observed net yield", "value": "+7.8%", "provenance": "demo" }
      ],
      "note": "Flagship demo outcome. Seeded evidence."
    }
  },
  {
    "id": "stay-in-range",
    "name": "Stay In Range",
    "description": "Keep a PancakeSwap LP position actively managed so it stays earning fees.",
    "goalType": "manage-liquidity",
    "requiredRoles": [
      {
        "role": "Rebalancing",
        "category": "rebalancing",
        "requiredCapabilities": ["rebalancing"]
      }
    ],
    "supportedProtocols": ["PancakeSwap"],
    "supportedAssets": ["BNB", "USDT", "CAKE"],
    "riskLevel": "balanced",
    "featured": true,
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Range uptime", "value": "92%", "provenance": "demo" },
        { "label": "Fees earned", "value": "+3.1%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence."
    }
  },
  {
    "id": "trade-with-guardrails",
    "name": "Trade With Guardrails",
    "description": "Run a grid trading strategy under a defined risk profile.",
    "goalType": "trade",
    "requiredRoles": [
      {
        "role": "Grid trading",
        "category": "grid-trading",
        "requiredCapabilities": ["grid-trading"]
      }
    ],
    "supportedProtocols": ["PancakeSwap"],
    "supportedAssets": ["BNB", "USDT"],
    "riskLevel": "aggressive",
    "featured": false,
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Realized PnL", "value": "+5.2%", "provenance": "demo" },
        { "label": "Max drawdown", "value": "-3.4%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence."
    }
  },
  {
    "id": "stablecoin-yield",
    "name": "Stablecoin Yield",
    "description": "Put idle stablecoins to work under conservative risk constraints.",
    "goalType": "earn",
    "requiredRoles": [
      {
        "role": "Yield optimization",
        "category": "yield-optimization",
        "requiredCapabilities": ["yield-optimization"]
      }
    ],
    "supportedProtocols": ["Venus"],
    "supportedAssets": ["USDT", "USDC"],
    "riskLevel": "conservative",
    "featured": true,
    "evidence": {
      "provenance": "demo",
      "windowDays": 30,
      "metrics": [
        { "label": "Observed net yield", "value": "+4.9%", "provenance": "demo" }
      ],
      "note": "Seeded demo evidence."
    }
  }
]
EOF

# ============================================================================
# Data adapter: interface + JSON implementation. Swap the impl later for a
# live source (8004scan / ERC-8004) without touching UI or engine.
# ============================================================================
cat > "$ROOT/src/lib/data/adapter.ts" <<'EOF'
import type { Agent, Category, Outcome } from "@/lib/domain/types";

// The seam between the product and its data source. Everything above this line
// (UI, recommendation engine) depends only on this interface.
export interface DataAdapter {
  listAgents(): Promise<Agent[]>;
  getAgent(id: string): Promise<Agent | null>;
  listAgentsByCategory(category: Category): Promise<Agent[]>;
  listOutcomes(): Promise<Outcome[]>;
  getOutcome(id: string): Promise<Outcome | null>;
  featuredOutcomes(): Promise<Outcome[]>;
}
EOF

cat > "$ROOT/src/lib/data/json-adapter.ts" <<'EOF'
import type { Agent, Category, Outcome } from "@/lib/domain/types";
import type { DataAdapter } from "@/lib/data/adapter";
import agents from "@data/seed/agents.json";
import outcomes from "@data/seed/outcomes.json";

// Seeded JSON implementation. Reads bundled JSON, validated at load by the
// tests in this milestone. Async signatures keep the interface identical to a
// future networked source.
const AGENTS = agents as unknown as Agent[];
const OUTCOMES = outcomes as unknown as Outcome[];

export class JsonAdapter implements DataAdapter {
  async listAgents(): Promise<Agent[]> {
    return AGENTS;
  }
  async getAgent(id: string): Promise<Agent | null> {
    return AGENTS.find((a) => a.id === id) ?? null;
  }
  async listAgentsByCategory(category: Category): Promise<Agent[]> {
    return AGENTS.filter((a) => a.category === category);
  }
  async listOutcomes(): Promise<Outcome[]> {
    return OUTCOMES;
  }
  async getOutcome(id: string): Promise<Outcome | null> {
    return OUTCOMES.find((o) => o.id === id) ?? null;
  }
  async featuredOutcomes(): Promise<Outcome[]> {
    return OUTCOMES.filter((o) => o.featured);
  }
}

// Single shared instance for the app to import.
export const data: DataAdapter = new JsonAdapter();
EOF

# Raw imports for tests (no aliases needed at node level via vitest aliases).
cat > "$ROOT/src/lib/data/index.ts" <<'EOF'
export * from "@/lib/data/adapter";
export * from "@/lib/data/json-adapter";
EOF

# ============================================================================
# Tests: data integrity + adapter behavior. These guard the product contract.
# ============================================================================
cat > "$ROOT/tests/data-integrity.test.ts" <<'EOF'
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
EOF

# --- verification ------------------------------------------------------------
echo "==> Verifying milestone 02"
echo "  - json parses"
node -e "JSON.parse(require('fs').readFileSync('data/seed/agents.json','utf8')); JSON.parse(require('fs').readFileSync('data/seed/outcomes.json','utf8')); console.log('    ok')"
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
  git commit -q -m "Milestone 02: domain model, seeded four-category data, JSON adapter + integrity tests"
  echo "  - committed"
fi

echo "==> Milestone 02 complete."
echo "    Next: git push origin main   (then: bash scripts/03_recommendation_engine.sh)"

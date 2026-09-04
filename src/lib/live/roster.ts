import type { Category } from "@/lib/domain/types";

// The qualified roster: ERC-8004 agent ids on BNB Smart Chain that were
// resolved from the registry and then answered when contacted, in each of the
// four required categories.
//
// This is a seed list for discovery, not a source of truth about the agents.
// Everything shown to a user (name, description, skills, price, availability)
// is read live from the agent's own registration file and endpoint at refresh
// time. An agent that stops answering is marked offline, never quietly dropped.
//
// `serviceId` is the seller's own id for the priced service, used when
// negotiating so the quote comes back for the right piece of work.

export interface RosterEntry {
  agentId: string;
  category: Category;
  serviceId?: string;
  /** Preferred read-only MCP tool for evidence, when the agent speaks MCP. */
  evidenceTool?: string;
  evidenceArgs?: Record<string, string>;
  protocols: string[];
  assets: string[];
}

export const ROSTER: RosterEntry[] = [
  // ---- Rebalancing ----
  {
    agentId: "304494",
    category: "rebalancing",
    serviceId: "rebalance_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "USDT", "USDC", "CAKE"],
  },
  {
    agentId: "293902",
    category: "rebalancing",
    serviceId: "rebalance_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "USDT"],
  },
  {
    agentId: "116173",
    category: "rebalancing",
    evidenceTool: "list_active_agents",
    protocols: ["Venus", "PancakeSwap"],
    assets: ["BNB", "USDT", "USDC"],
  },

  // ---- Grid trading ----
  {
    agentId: "302258",
    category: "grid-trading",
    serviceId: "grid_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "CAKE", "USDT"],
  },
  {
    agentId: "303779",
    category: "grid-trading",
    serviceId: "grid_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "USDT"],
  },
  {
    agentId: "269224",
    category: "grid-trading",
    serviceId: "grid_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "USDT"],
  },

  // ---- Yield optimisation ----
  {
    agentId: "304493",
    category: "yield-optimization",
    serviceId: "yield_plan",
    protocols: ["Venus"],
    assets: ["USDT", "USDC", "BNB"],
  },
  {
    agentId: "310460",
    category: "yield-optimization",
    serviceId: "lp_tier_plan",
    protocols: ["PancakeSwap"],
    assets: ["BNB", "CAKE", "USDT"],
  },
  {
    agentId: "116172",
    category: "yield-optimization",
    evidenceTool: "list_active_agents",
    protocols: ["Venus", "PancakeSwap"],
    assets: ["USDT", "USDC"],
  },

  // ---- Health-factor monitoring ----
  {
    agentId: "302257",
    category: "health-factor-monitoring",
    serviceId: "health_factor",
    protocols: ["Venus"],
    assets: ["USDT", "USDC", "BNB"],
  },
  {
    agentId: "266933",
    category: "health-factor-monitoring",
    evidenceTool: "get_chain_info",
    protocols: ["Venus"],
    assets: ["USDT", "USDC", "BNB"],
  },
  {
    agentId: "269228",
    category: "health-factor-monitoring",
    serviceId: "health_factor",
    protocols: ["Venus"],
    assets: ["USDT", "USDC", "BNB"],
  },
];

export const rosterFor = (category: Category) => ROSTER.filter((r) => r.category === category);
export const rosterEntry = (agentId: string) => ROSTER.find((r) => r.agentId === agentId);

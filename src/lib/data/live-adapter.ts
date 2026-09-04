import type { Agent, Category, Outcome } from "@/lib/domain/types";
import type { DataAdapter } from "@/lib/data/adapter";
import { JsonAdapter } from "@/lib/data/json-adapter";
import { liveAgents } from "@/lib/live/snapshot";

// The marketplace's real data source. Live ERC-8004 agents come first; seeded
// examples remain only to fill a category that has no live supply right now,
// and they keep source "seed" so the UI can label them.
//
// The interface is unchanged, so nothing above this file had to move.

const seed = new JsonAdapter();

function order(agents: Agent[]): Agent[] {
  const rank = (a: Agent) =>
    (a.source === "seed" ? 100 : 0) +
    (a.status === "available" ? 0 : a.status === "limited" ? 10 : 20);
  return [...agents].sort((a, b) => rank(a) - rank(b) || b.reputation - a.reputation);
}

export class LiveAdapter implements DataAdapter {
  async listAgents(): Promise<Agent[]> {
    const live = await liveAgents();
    const seeded = await seed.listAgents();
    // Keep a seeded example only where live supply is missing for its category.
    const covered = new Set(live.map((a) => a.category));
    return order([...live, ...seeded.filter((s) => !covered.has(s.category))]);
  }

  async getAgent(id: string): Promise<Agent | null> {
    const live = await liveAgents();
    return live.find((a) => a.id === id) ?? (await seed.getAgent(id));
  }

  async listAgentsByCategory(category: Category): Promise<Agent[]> {
    return (await this.listAgents()).filter((a) => a.category === category);
  }

  // Outcomes are the product's own compositions, not third-party inventory, so
  // they stay authored. Their agent roles bind to whatever live supply exists.
  async listOutcomes(): Promise<Outcome[]> {
    return seed.listOutcomes();
  }
  async getOutcome(id: string): Promise<Outcome | null> {
    return seed.getOutcome(id);
  }
  async featuredOutcomes(): Promise<Outcome[]> {
    return seed.featuredOutcomes();
  }
}

export const data: DataAdapter = new LiveAdapter();

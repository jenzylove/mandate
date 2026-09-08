import type { Agent, Category, Outcome } from "@/lib/domain/types";
import type { DataAdapter } from "@/lib/data/adapter";
import { JsonAdapter } from "@/lib/data/json-adapter";
import { liveAgents, resolveAgentOnDemand } from "@/lib/live/snapshot";

// The marketplace's real data source. Live ERC-8004 agents come first; seeded
// examples remain only to fill a category that has no live supply right now,
// and they keep source "seed" so the UI can label them.
//
// The interface is unchanged, so nothing above this file had to move.

const seed = new JsonAdapter();

/**
 * Rank the catalogue, then interleave it by operator.
 *
 * Sorting on quality alone put five services from one operator at the top,
 * which reads as a shopfront rather than a market. Every agent is kept and the
 * best still lead; the round robin only decides who is adjacent to whom.
 */
function order(agents: Agent[]): Agent[] {
  // Proof of hireability dominates the order. An agent Mandate can actually pay
  // or run belongs above one that only answered, whatever else it has going for
  // it, because the first can be bought and the second cannot.
  const proven = (a: Agent) =>
    a.pricing !== "No price quoted" && a.pricing !== "Unavailable" && a.pricing !== "";

  const rank = (a: Agent) =>
    (proven(a) ? 1000 : 0) +
    (a.status === "available" ? 200 : a.status === "limited" ? 80 : 0) +
    (a.image ? 20 : 0) +
    a.reputation;

  const spread = (tier: Agent[]): Agent[] => {
    const byOperator = new Map<string, Agent[]>();
    for (const a of [...tier].sort((x, y) => rank(y) - rank(x))) {
      const op = (a.owner || a.id).toLowerCase();
      const list = byOperator.get(op) ?? [];
      list.push(a);
      byOperator.set(op, list);
    }
    const queues = [...byOperator.values()];
    const out: Agent[] = [];
    for (let round = 0; out.length < tier.length; round++) {
      let moved = false;
      for (const q of queues) {
        if (q[round]) {
          out.push(q[round]);
          moved = true;
        }
      }
      if (!moved) break;
    }
    return out;
  };

  // Hireable inventory first, spread across its operators; then the rest,
  // spread across theirs. Variety never promotes an agent past a tier.
  return [...spread(agents.filter(proven)), ...spread(agents.filter((a) => !proven(a)))];
}

export class LiveAdapter implements DataAdapter {
  async listAgents(): Promise<Agent[]> {
    // Real agents only. A seeded listing cannot be inspected, hired or settled,
    // so padding a thin category with one is a promise the marketplace cannot
    // keep. An empty category is the honest answer.
    return order(await liveAgents());
  }

  async getAgent(id: string): Promise<Agent | null> {
    const live = await liveAgents();
    const hit = live.find((a) => a.id === id);
    if (hit) return hit;

    // Each serverless instance refreshes its own snapshot, so a link rendered
    // by one instance can reach another that has never seen that agent. Rather
    // than 404 a real agent, resolve it from the registry on demand.
    const onDemand = await resolveAgentOnDemand(id);
    if (onDemand) return onDemand;

    return seed.getAgent(id);
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

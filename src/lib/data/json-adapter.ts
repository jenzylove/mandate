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

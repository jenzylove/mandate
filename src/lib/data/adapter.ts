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

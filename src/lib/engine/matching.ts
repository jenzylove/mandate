import type { Agent, Outcome, OutcomeQuery, OutcomeRole } from "@/lib/domain/types";

/** The single eligibility rule shared by recommendations and review. */
export function compatibleWithRole(agent: Agent, role: OutcomeRole, query: OutcomeQuery): boolean {
  if (agent.category !== role.category) return false;
  if (agent.source === "seed" || !agent.hireable || agent.status === "offline") return false;
  if (query.protocol && !agent.protocols.some((p) => p.toLowerCase() === query.protocol!.toLowerCase())) return false;
  if (query.asset && !agent.assets.some((a) => a.toLowerCase() === query.asset!.toLowerCase())) return false;
  if (!agent.supportedControlModes.includes(query.control)) return false;
  const advertised = new Set(agent.capabilities.map((c) => c.toLowerCase().replaceAll("_", "-").trim()));
  return role.requiredCapabilities.length === 0 || role.requiredCapabilities.some((c) => advertised.has(c.toLowerCase().replaceAll("_", "-").trim()) || c === role.category);
}

export function compatibleAgents(agents: Agent[], outcome: Outcome, query: OutcomeQuery, role: OutcomeRole): Agent[] {
  return agents.filter((agent) => compatibleWithRole(agent, role, query));
}

export function recommendationIsReviewable(agents: Agent[], outcome: Outcome, query: OutcomeQuery, selected: { agentId: string; role: string }[]): boolean {
  if (selected.length !== outcome.requiredRoles.length) return false;
  const used = new Set<string>();
  return outcome.requiredRoles.every((role) => {
    const hit = selected.find((selection) => selection.role === role.role && !used.has(selection.agentId));
    const agent = hit && agents.find((candidate) => candidate.id === hit.agentId);
    if (!hit || !agent || !compatibleWithRole(agent, role, query)) return false;
    used.add(agent.id);
    return true;
  });
}

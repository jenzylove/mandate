import Link from "next/link";
import { data } from "@/lib/data/live-adapter";
import { recommend } from "@/lib/engine/recommend";
import { SaveSetup, WalletGate } from "@/components/connected";
import { ActivateAgent } from "@/components/activate";
import { liveAgents } from "@/lib/live/snapshot";
import { SETTLEMENT_NETWORK } from "@/lib/live/chain";
import type { OutcomeQuery, RiskLevel, ControlMode } from "@/lib/domain/types";
import { compatibleAgents, recommendationIsReviewable } from "@/lib/engine/matching";

export const dynamic = "force-dynamic";

export default async function CreateOutcome({
  searchParams: p,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const [outcomes, agents, live] = await Promise.all([
    data.listOutcomes(),
    data.listAgents(),
    liveAgents(),
  ]);
  const outcome = outcomes.find((o) => o.id === p.outcome);
  const agent = agents.find((a) => a.id === p.agent);
  const risk: RiskLevel = ["conservative", "balanced", "aggressive"].includes(
    p.risk ?? "",
  )
    ? (p.risk as RiskLevel)
    : "balanced";
  const control: ControlMode = ["monitor", "ask", "autopilot"].includes(
    p.control ?? "",
  )
    ? (p.control as ControlMode)
    : "ask";
  const query: OutcomeQuery = {
    goalType: outcome?.goalType ?? "earn",
    risk,
    control,
    asset: p.asset || undefined,
    protocol: p.protocol || undefined,
  };
  const rec = outcome
    ? recommend({ query, outcome, agents }).find(
        (r) => r.mode === (p.mode ?? "balanced"),
      )
    : undefined;
  const selected = agent
    ? [agent]
    : rec
      ? rec.agents.map((a) => agents.find((x) => x.id === a.agentId)!)
      : [];
  const recommendationValid = Boolean(
    outcome && rec && recommendationIsReviewable(agents, outcome, query, rec.agents),
  );
  const valid =
    agent || recommendationValid;

  const liveIds = new Set(live.map((a) => a.id));
  const liveSelected = selected.filter((a) => a && liveIds.has(a.id));
  const seededSelected = selected.filter((a) => a && !liveIds.has(a.id));
  const settlementLabel =
    SETTLEMENT_NETWORK === "bsc-testnet" ? "BNB Smart Chain testnet" : "BNB Smart Chain";

  return (
    <main className="flow-shell">
      <div className="flow-heading">
        <p className="eyebrow">YOUR NEXT MOVE</p>
        <h1>Review your setup.</h1>
        <p>
          Make sure the purpose, agents and costs fit what you have in mind.
        </p>
      </div>
      {valid ? (
        <>
          <section className="panel">
            <p className="eyebrow">
              {liveSelected.length ? "READY TO ACTIVATE" : "SETUP UNAVAILABLE"}
            </p>
            <h2>{outcome?.name ?? agent?.name}</h2>
            <p>{outcome?.description ?? agent?.description}</p>
            <div className="review-summary">
              <span>{risk} preference</span>
              <span>
                {control === "ask"
                  ? "Ask before acting"
                  : control === "monitor"
                    ? "Monitor only"
                    : "Autopilot"}
              </span>
              {p.asset && <span>{p.asset}</span>}
              {p.protocol && <span>{p.protocol}</span>}
            </div>
            {selected.map((a) => (
              <div className="role-row" key={a.id}>
                <Link href={`/agents/${a.id}`}>{a.name} ↗</Link>
                <p>
                  {liveIds.has(a.id)
                    ? `${a.pricing} · live onchain agent`
                    : `${a.pricing} · not currently available for activation`}
                </p>
              </div>
            ))}
            {seededSelected.length > 0 && (
              <div className="notice">
                {seededSelected.length} selected listing(s) are not in the current
                marketplace catalogue and cannot be activated.
              </div>
            )}
          </section>

          <div style={{ height: 24 }} />

          {liveSelected.map((a) => (
            <div key={a.id} style={{ marginBottom: 24 }}>
              <ActivateAgent
                target={{
                  agentId: a.id,
                  agentName: a.name,
                  category: a.category,
                  pricing: a.pricing,
                  request:
                    outcome?.description ??
                    `${a.category.replaceAll("-", " ")} for a position on BNB Smart Chain`,
                  outcomeId: outcome?.id,
                  context: {
                    asset: p.asset,
                    protocol: p.protocol,
                    risk,
                    control,
                    outcomeId: outcome?.id,
                    requestedDeliverable: outcome?.description,
                  },
                  fallbackAgentIds: outcome
                    ? compatibleAgents(
                        agents,
                        outcome,
                        query,
                        outcome.requiredRoles.find((role) => role.category === a.category) ?? outcome.requiredRoles[0],
                      )
                        .filter((candidate) => candidate.id !== a.id)
                        .map((candidate) => candidate.id)
                        .slice(0, 5)
                    : [],
                  settlementLabel,
                  live: true,
                }}
              />
            </div>
          ))}

          <SaveSetup
            setup={{
              id: agent
                ? `agent-${agent.id}`
                : `${outcome!.id}-${rec!.mode}-${risk}-${control}-${p.asset || "any"}-${p.protocol || "any"}`,
              name: outcome?.name ?? agent!.name,
              outcomeId: outcome?.id,
              agentIds: selected.map((a) => a.id),
              risk,
              control,
              asset: p.asset,
              protocol: p.protocol,
            }}
          />
          <div className="flow-footer">
            <Link className="text-link" href={`/find/recommendations?goal=${query.goalType}&asset=${query.asset ?? ""}&protocol=${query.protocol ?? ""}&risk=${query.risk}&control=${query.control}&outcome=${outcome?.id ?? ""}`}>
              ← Back to matches
            </Link>
            <Link className="text-link" href={`/find/context?goal=${query.goalType}&outcome=${outcome?.id ?? ""}&asset=${query.asset ?? ""}&protocol=${query.protocol ?? ""}&risk=${query.risk}&control=${query.control}`}>
              Change preferences
            </Link>
          </div>
        </>
      ) : (
        <WalletGate>
          <section className="empty-state">
            <h2>Start with a matched setup.</h2>
            <p>
              {p.outcome || p.agent
                ? "This selection is unavailable or incompatible. Please find another match."
                : "Custom outcomes are not available yet. Start with a ready-made outcome and choose your preferences."}
            </p>
            <Link className="button primary" href="/find/goal">
              Find my fit ↗
            </Link>
          </section>
        </WalletGate>
      )}
    </main>
  );
}

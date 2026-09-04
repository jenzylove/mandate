import Link from "next/link";
import { data } from "@/lib/data/live-adapter";
import { recommend } from "@/lib/engine/recommend";
import { SaveSetup, WalletGate } from "@/components/connected";
import { ActivateAgent } from "@/components/activate";
import { liveAgents } from "@/lib/live/snapshot";
import { SETTLEMENT_NETWORK } from "@/lib/live/chain";
import type { OutcomeQuery, RiskLevel, ControlMode } from "@/lib/domain/types";

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
  const valid =
    agent ||
    (outcome &&
      rec &&
      (!p.asset || outcome.supportedAssets.includes(p.asset)) &&
      (!p.protocol || outcome.supportedProtocols.includes(p.protocol)));

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
              {liveSelected.length ? "READY TO ACTIVATE" : "DEMO SETUP · NOT ACTIVE"}
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
                    : `Example cost: ${a.pricing} · seeded listing`}
                </p>
              </div>
            ))}
            {seededSelected.length > 0 && (
              <div className="notice">
                {seededSelected.length} of these listings are seeded examples with no
                onchain identity. They cannot be activated.
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

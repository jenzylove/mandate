import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import { SaveSetup, WalletGate } from "@/components/connected";
import type { OutcomeQuery, RiskLevel, ControlMode } from "@/lib/domain/types";
export default async function CreateOutcome({
  searchParams: p,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const [outcomes, agents] = await Promise.all([
    data.listOutcomes(),
    data.listAgents(),
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
  return (
    <main className="flow-shell">
      <div className="flow-heading">
        <p className="eyebrow">YOUR NEXT MOVE</p>
        <h1>Review your setup.</h1>
        <p>
          Make sure the purpose, agents and example costs fit what you have in
          mind.
        </p>
      </div>
      {valid ? (
        <>
          <section className="panel">
            <p className="eyebrow">DEMO SETUP · NOT ACTIVE</p>
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
                <p>Example cost: {a.pricing}</p>
              </div>
            ))}
            <div className="notice">
              Live activation is not available. These listings, availability and
              evidence are seeded examples.
            </div>
          </section>
          <div style={{ height: 24 }} />
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

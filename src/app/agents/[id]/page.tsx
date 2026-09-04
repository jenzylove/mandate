import Link from "next/link";
import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";
import {
  SymbolArt,
  EvidencePanel,
  categoryNames,
  goalForCategory,
} from "@/components/market-ui";
export default async function AgentDetail({
  params,
}: {
  params: { id: string };
}) {
  const a = await data.getAgent(params.id);
  if (!a) notFound();
  return (
    <main className="shell">
      <div className="page-top">
        <div className="breadcrumbs">
          <Link href="/agents">Agents</Link> / {a.name}
        </div>
        <p className="eyebrow">{categoryNames[a.category]} · DEMO AGENT</p>
        <h1>{a.name}</h1>
        <p>{a.description}</p>
      </div>
      <div className="detail-grid">
        <div className="detail-stack">
          <div className="detail-visual">
            <SymbolArt goal={goalForCategory[a.category]} large />
          </div>
          <section className="panel">
            <h2>What this agent can do</h2>
            {a.capabilities.map((c) => (
              <div className="role-row" key={c}>
                {c.replaceAll("-", " ")}
              </div>
            ))}
            <p>
              Control options:{" "}
              {a.supportedControlModes
                .map((c) =>
                  c === "ask"
                    ? "Ask before acting"
                    : c === "monitor"
                      ? "Monitor only"
                      : "Autopilot",
                )
                .join(" · ")}
            </p>
          </section>
          <EvidencePanel evidence={a.evidence} />
          <details className="panel onchain">
            <summary>Onchain & source details</summary>
            <p>Network: {a.networks.join(", ")}</p>
            <p>
              Source: {a.source} · Owner label: {a.owner}
            </p>
            <p>
              {a.source === "seed"
                ? "Owner labels and reputation are seeded examples, not verified identities."
                : ""}
            </p>
          </details>
        </div>
        <aside className="panel detail-side">
          <p className="eyebrow">AGENT OVERVIEW</p>
          <h3>Your specialist, on your terms.</h3>
          <dl>
            <div>
              <dt>Example pricing</dt>
              <dd>{a.pricing}</dd>
            </div>
            <div>
              <dt>Supported assets</dt>
              <dd>{a.assets.join(" · ")}</dd>
            </div>
            <div>
              <dt>Works with</dt>
              <dd>{a.protocols.join(" · ")}</dd>
            </div>
            <div>
              <dt>Seeded status / reputation</dt>
              <dd>
                {a.status} · {a.reputation}/100 (demo)
              </dd>
            </div>
          </dl>
          <Link
            className="button primary"
            href={`/outcomes/create?agent=${a.id}`}
          >
            Review this agent ↗
          </Link>
          <p>
            This is a demo listing. Review and save your preferences; live
            activation is not yet connected.
          </p>
        </aside>
      </div>
    </main>
  );
}

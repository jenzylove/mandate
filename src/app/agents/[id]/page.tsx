import Link from "next/link";
import { notFound } from "next/navigation";
import { data } from "@/lib/data/live-adapter";
import { liveAgent } from "@/lib/live/snapshot";
import { SETTLEMENT_NETWORK } from "@/lib/live/chain";
import { ActivateAgent } from "@/components/activate";
import {
  SymbolArt,
  EvidencePanel,
  categoryNames,
  goalForCategory,
} from "@/components/market-ui";

export const dynamic = "force-dynamic";

const capabilityCopy: Record<string, { title: string; detail: string }> = {
  explain_strategy: {
    title: "Explain strategy",
    detail: "Explains the strategy, assumptions, and constraints behind its recommendation.",
  },
  list_agents: {
    title: "List available agents",
    detail: "Returns the services or specialist agents currently exposed by this provider.",
  },
  get_hire_link: {
    title: "Provide a hire route",
    detail: "Returns the provider's current route for requesting or hiring a service; it does not itself prove a paid quote.",
  },
};

function capabilityInfo(raw: string, description: string) {
  const normalized = raw.replaceAll("-", "_").trim().toLowerCase();
  const known = capabilityCopy[normalized];
  if (known) return known;
  const title = raw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    title,
    detail: `The agent advertises this capability for its stated service: ${description}`,
  };
}

export default async function AgentDetail({
  params,
}: {
  params: { id: string };
}) {
  const a = await data.getAgent(params.id);
  if (!a) notFound();
  const live = await liveAgent(params.id);
  const isLive = Boolean(live);
  const settlementLabel =
    SETTLEMENT_NETWORK === "bsc-testnet" ? "BNB Smart Chain testnet" : "BNB Smart Chain";
  const statusLabel =
    a.status === "available"
      ? "Answering now"
      : a.status === "limited"
        ? "Reachable, limited"
        : "Not answering";
  const confirmed = new Set([
    ...(live?.live.probe.skills ?? []),
    ...(live?.live.probe.tools ?? []),
  ].map((skill) => skill.toLowerCase()));
  const priceLabel = a.pricing === "Free"
    ? "Free tool confirmed"
    : a.pricing === "Price not verified" || a.pricing === "No price quoted"
      ? isLive && a.status !== "offline" ? "Quote on hire" : "Unavailable"
      : isLive ? "Price quoted by the agent" : "Example pricing";

  return (
    <main className="shell">
      <div className="page-top">
        <div className="breadcrumbs">
          <Link href="/agents">Agents</Link> / {a.name}
        </div>
        <p className="eyebrow">
          {categoryNames[a.category]} · {isLive ? "LIVE ONCHAIN AGENT" : "DEMO AGENT"}
        </p>
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
                <strong>{capabilityInfo(c, a.description).title}</strong>
                <p>{capabilityInfo(c, a.description).detail}</p>
                <small className={confirmed.has(c.toLowerCase()) ? "capability-confirmed" : "capability-advertised"}>
                  {confirmed.has(c.toLowerCase()) ? "Confirmed by latest endpoint probe" : "Advertised by the agent; not independently callable in the latest probe"}
                </small>
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

          {isLive && (
            <ActivateAgent
              target={{
                agentId: a.id,
                agentName: a.name,
                category: a.category,
                pricing: a.pricing,
                request: `${categoryNames[a.category]} for a position on BNB Smart Chain`,
                settlementLabel,
                live: true,
              }}
            />
          )}

          <details className="panel onchain">
            <summary>Onchain &amp; source details</summary>
            {live ? (
              <>
                <p>Network: {a.networks.join(", ")}</p>
                <p>
                  ERC-8004 identity: #{live.live.agentId} ·{" "}
                  <a href={live.live.explorerUrl} target="_blank" rel="noreferrer">
                    view on explorer ↗
                  </a>
                </p>
                <p>Registry: {live.live.registry}</p>
                <p>Owner: {a.owner}</p>
                <p>
                  Transports declared: {live.live.routes.map((r) => r.kind).join(" · ")} ·
                  routed via {live.live.route?.kind}
                </p>
                <p>Endpoint: {a.endpoint ?? "onchain only"}</p>
                <p>
                  Availability: {statusLabel} · {live.live.probe.detail} · checked{" "}
                  {new Date(live.live.probe.checkedAt).toISOString().replace("T", " ").slice(0, 16)}{" "}
                  UTC
                </p>
                <p>
                  Name, description, skills and price on this page are read from the
                  agent&apos;s own ERC-8004 registration and endpoint, not authored by
                  Mandate.
                </p>
              </>
            ) : (
              <>
                <p>Network: {a.networks.join(", ")}</p>
                <p>
                  Source: {a.source} · Owner label: {a.owner}
                </p>
                <p>
                  This is seeded placeholder inventory. Owner labels and reputation are
                  examples, not verified identities, and it cannot be hired.
                </p>
              </>
            )}
          </details>
        </div>
        <aside className="panel detail-side">
          <p className="eyebrow">AGENT OVERVIEW</p>
          <h3>Your specialist, on your terms.</h3>
          <dl>
            <div>
              <dt>{priceLabel}</dt>
              <dd>{a.pricing === "Price not verified" || a.pricing === "No price quoted" ? (isLive && a.status !== "offline" ? "Quote available when you request a hire" : "Not currently available") : a.pricing}</dd>
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
              <dt>{isLive ? "Availability" : "Seeded status / reputation"}</dt>
              <dd>
                {isLive ? statusLabel : `${a.status} · ${a.reputation}/100 (demo)`}
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
            {isLive
              ? "Browsing is open to everyone. A wallet is only needed when you activate."
              : "This is a demo listing. Review and save your preferences; it cannot be activated."}
          </p>
        </aside>
      </div>
    </main>
  );
}

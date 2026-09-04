import type { Agent, AgentStatus, Evidence, Metric, Provenance } from "@/lib/domain/types";
import { discover, type DiscoveredAgent, type Route } from "@/lib/live/discover";
import { probe, quote, type ProbeResult, type Quote } from "@/lib/live/agent-adapter";
import { ROSTER, type RosterEntry } from "@/lib/live/roster";
import { DISCOVERY_NETWORK, net } from "@/lib/live/chain";

// A live agent as the marketplace stores it: the domain Agent the UI already
// knows, plus the routing and pricing facts the hire flow needs.
export interface LiveAgent extends Agent {
  live: {
    agentId: string;
    network: string;
    registry: string;
    explorerUrl: string;
    routes: Route[];
    route: Route | null;
    serviceId?: string;
    probe: ProbeResult;
    quote?: {
      accepted: boolean;
      priceRaw?: string;
      priceDisplay?: string;
      currency?: string;
      provider?: string;
      needs?: Record<string, string>;
      deliverables?: string;
      chainId?: number;
      verifyingContract?: string;
      paymentToken?: string;
      estimatedSeconds?: number;
    };
    refreshedAt: string;
  };
}

const m = (label: string, value: string, provenance: Provenance = "live"): Metric => ({
  label,
  value,
  provenance,
});

// Capabilities come from what the agent itself says it serves, not from a
// label we assign. Fall back to the roster category when a card is terse.
function capabilitiesFrom(d: DiscoveredAgent, p: ProbeResult, entry: RosterEntry): string[] {
  const fromSkills = (p.skills ?? []).filter((s) => s !== "negotiate" && s !== "notify_funded");
  const fromTools = (p.tools ?? []).slice(0, 6);
  const fromCard = Array.isArray(d.card.skills)
    ? (d.card.skills as { id?: string; name?: string }[]).map((s) => s.id ?? s.name ?? "").filter(Boolean)
    : [];
  const all = [...new Set([...fromSkills, ...fromCard, ...fromTools])].filter(
    (s) => s !== "negotiate" && s !== "notify_funded",
  );
  return all.length ? all.slice(0, 8) : [entry.category];
}

function statusFrom(p: ProbeResult): AgentStatus {
  if (p.ok) return "available";
  // A card that resolves but whose endpoint refuses is limited, not gone; an
  // endpoint that never connects is offline.
  return /HTTP 4|JSON-RPC|names no skills/.test(p.detail) ? "limited" : "offline";
}

function evidenceFrom(d: DiscoveredAgent, p: ProbeResult, q?: Quote): Evidence {
  const metrics: Metric[] = [
    m("Answered when contacted", p.ok ? "Yes" : "No"),
    m("Last checked", new Date(p.checkedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC"),
    m("Transports", d.routes.map((r) => r.kind).join(" · ") || "none"),
  ];
  if (p.skills?.length) metrics.push(m("Published skills", String(p.skills.length)));
  if (p.tools?.length) metrics.push(m("Callable tools", String(p.tools.length)));
  if (q?.accepted && q.priceDisplay) metrics.push(m("Quoted price", q.priceDisplay));
  return {
    provenance: p.ok ? "live" : "unavailable",
    metrics,
    note: p.ok
      ? `Read from the ERC-8004 registry and confirmed by contacting the agent directly. ${p.detail}.`
      : `Registered on chain but not answering right now: ${p.detail}.`,
  };
}

// Reputation is not invented. It is a transparent function of what we could
// verify, and the evidence panel shows every input.
function reputationFrom(d: DiscoveredAgent, p: ProbeResult, q?: Quote): number {
  let score = 40;
  if (p.ok) score += 25;
  if (d.routes.some((r) => r.kind === "ERC8183")) score += 10;
  if (q?.accepted) score += 15;
  if ((p.skills?.length ?? 0) > 2 || (p.tools?.length ?? 0) > 2) score += 10;
  return Math.min(100, score);
}

async function buildOne(entry: RosterEntry): Promise<LiveAgent | null> {
  let d: DiscoveredAgent;
  try {
    d = await discover(DISCOVERY_NETWORK, entry.agentId);
  } catch {
    return null; // unresolvable on chain: not supply
  }
  const route = d.route;
  if (!route) return null;

  const p = await probe(route);

  // Only ask for a price if the agent is answering and prices its work.
  let q: Quote | undefined;
  if (p.ok) {
    try {
      q = await quote(route, `${entry.category} for a BNB Chain position`, entry.serviceId);
    } catch {
      q = undefined;
    }
  }

  const n = net(DISCOVERY_NETWORK);
  const pricing = q?.accepted
    ? q.priceDisplay ?? (q.priceRaw ? `${Number(q.priceRaw) / 1e18} ${q.currency ?? "U"}` : "Quoted on request")
    : p.ok
      ? "Quoted on request"
      : "Unavailable";

  return {
    id: `live-${entry.agentId}`,
    name: d.name ?? `Agent #${entry.agentId}`,
    description:
      d.description ??
      "Registered on the ERC-8004 identity registry on BNB Smart Chain.",
    owner: d.owner,
    category: entry.category,
    capabilities: capabilitiesFrom(d, p, entry),
    protocols: entry.protocols,
    assets: entry.assets,
    networks: ["BNB Smart Chain"],
    reputation: reputationFrom(d, p, q),
    metrics: [
      m("Status", p.ok ? "Answering" : "Not answering"),
      m("Transport", route.kind),
      m("Onchain id", `#${entry.agentId}`),
    ],
    status: statusFrom(p),
    pricing,
    endpoint: route.endpoint ?? undefined,
    source: "erc8004",
    supportedControlModes:
      entry.category === "health-factor-monitoring" ? ["monitor", "ask"] : ["monitor", "ask"],
    evidence: evidenceFrom(d, p, q),
    live: {
      agentId: entry.agentId,
      network: DISCOVERY_NETWORK,
      registry: n.registry,
      explorerUrl: `${n.explorer}/token/${n.registry}?a=${entry.agentId}`,
      routes: d.routes,
      route,
      serviceId: entry.serviceId,
      probe: p,
      quote: q
        ? {
            accepted: q.accepted,
            priceRaw: q.priceRaw,
            priceDisplay: q.priceDisplay,
            currency: q.currency,
            provider: q.provider,
            needs: q.needs,
            deliverables: q.deliverables,
            chainId: q.chainId,
            verifyingContract: q.verifyingContract,
            paymentToken: q.paymentToken,
            estimatedSeconds: q.estimatedSeconds,
          }
        : undefined,
      refreshedAt: new Date().toISOString(),
    },
  };
}

/** Resolve and probe the whole roster. Slow (network bound); cache the result. */
export async function qualifyAll(): Promise<LiveAgent[]> {
  const out: LiveAgent[] = [];
  const CONC = 4;
  for (let i = 0; i < ROSTER.length; i += CONC) {
    const batch = await Promise.all(ROSTER.slice(i, i + CONC).map(buildOne));
    out.push(...batch.filter((x): x is LiveAgent => x !== null));
  }
  return out;
}

export { buildOne };

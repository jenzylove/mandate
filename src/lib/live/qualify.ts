import type { Agent, AgentStatus, Evidence, Metric, Provenance } from "@/lib/domain/types";
import { discover, type DiscoveredAgent, type Route } from "@/lib/live/discover";
import { probe, quote, type ProbeResult, type Quote } from "@/lib/live/agent-adapter";
import { ROSTER, rosterFor, type RosterEntry } from "@/lib/live/roster";
import { candidatesForCategory } from "@/lib/live/indexer";
import { REQUIRED_CATEGORIES } from "@/lib/domain/types";
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
  let d: DiscoveredAgent | null = null;
  // A flaky RPC or a slow card host must not silently delete supply, so try
  // twice before concluding an agent cannot be resolved.
  for (let attempt = 0; attempt < 2 && !d; attempt++) {
    try {
      d = await discover(DISCOVERY_NETWORK, entry.agentId);
    } catch {
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  if (!d) return null; // unresolvable on chain: not supply
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

  const discovered = !ROSTER.some((r) => r.agentId === entry.agentId);

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
    source: discovered ? "erc8004+8004scan" : "erc8004",
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

// How many agents we are willing to resolve and probe per category. Discovery
// is unbounded; a refresh is not.
const MAX_PER_CATEGORY = 8;

/**
 * Build the candidate list: the maintained roster first, so a category is never
 * empty, then whatever the indexer surfaces that we do not already carry.
 */
export async function candidateEntries(): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = [];
  const known = new Set(ROSTER.map((r) => r.agentId));

  const discovered = await Promise.all(
    REQUIRED_CATEGORIES.map(async (category) => {
      const roster = rosterFor(category);
      const room = MAX_PER_CATEGORY - roster.length;
      if (room <= 0) return [] as RosterEntry[];
      const found = await candidatesForCategory(category, room + 4);
      return found
        .filter((c) => !known.has(c.agentId))
        .slice(0, room)
        .map<RosterEntry>((c) => {
          known.add(c.agentId);
          // Protocols and assets are unknown for a discovered agent until it
          // tells us; these are the defaults every BNB Chain agent shares.
          return {
            agentId: c.agentId,
            category,
            protocols: ["BNB Chain"],
            assets: ["BNB", "USDT", "USDC"],
          };
        });
    }),
  );

  for (const category of REQUIRED_CATEGORIES) entries.push(...rosterFor(category));
  for (const batch of discovered) entries.push(...batch);
  return entries;
}

/** Resolve and probe every candidate. Slow (network bound); cache the result. */
export async function qualifyAll(): Promise<LiveAgent[]> {
  const entries = await candidateEntries();
  const out: LiveAgent[] = [];
  const CONC = 6;
  for (let i = 0; i < entries.length; i += CONC) {
    const batch = await Promise.all(entries.slice(i, i + CONC).map(buildOne));
    out.push(...batch.filter((x): x is LiveAgent => x !== null));
  }
  // An agent that does not answer is not supply. Rostered ones are kept even
  // when offline so an outage is visible rather than silently hidden.
  const rostered = new Set(ROSTER.map((r) => r.agentId));
  return out.filter((a) => a.status !== "offline" || rostered.has(a.live.agentId));
}

export { buildOne };

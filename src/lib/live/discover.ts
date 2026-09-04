import { publicClientFor, net, identityAbi, type NetworkName } from "@/lib/live/chain";

// An ERC-8004 registration file, as it actually appears in the wild rather than
// as the spec describes it. Real cards disagree about casing, pluralisation and
// where endpoints live, so everything here is optional and normalized on read.
export interface AgentCard {
  name?: string;
  description?: string;
  image?: string;
  services?: unknown[];
  endpoints?: unknown[];
  skills?: unknown[];
  tags?: string[];
  url?: string;
  active?: boolean;
  x402Support?: boolean;
  x402support?: boolean;
  supportedTrust?: string[];
  supportedTrusts?: string[];
  registrations?: unknown[];
  [k: string]: unknown;
}

export type RouteKind = "A2A" | "MCP" | "ERC8183" | "x402" | "WEB";

export interface Route {
  kind: RouteKind;
  endpoint: string | null;
  version?: string | null;
  note?: string;
}

export interface DiscoveredAgent {
  agentId: string;
  chain: NetworkName;
  registry: string;
  owner: string;
  uri: string;
  via: "data-uri" | "https";
  name: string | null;
  description: string | null;
  card: AgentCard;
  routes: Route[];
  route: Route | null;
}

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : null;

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function normalizedEndpoints(card: AgentCard) {
  const raw = ([] as unknown[]).concat(card.services ?? [], card.endpoints ?? []);
  return raw
    .map(asRecord)
    .filter((e): e is Record<string, unknown> => e !== null)
    .map((e) => ({
      name: String(e.name ?? e.type ?? e.protocol ?? "").toLowerCase(),
      endpoint: str(e.endpoint) ?? str(e.url) ?? str(e.uri) ?? str(e.serviceEndpoint),
      version: str(e.version),
    }));
}

// Decide what we can actually invoke. Order of the returned list is discovery
// order; `bestRoute` applies the preference.
export function classify(card: AgentCard | null): Route[] {
  if (!card) return [];
  const routes: Route[] = [];
  const push = (r: Route) => {
    if (!routes.some((x) => x.kind === r.kind)) routes.push(r);
  };

  for (const e of normalizedEndpoints(card)) {
    if (!e.endpoint) continue;
    const n = e.name.replace(/[-_]/g, "");
    if (n.includes("a2a")) push({ kind: "A2A", endpoint: e.endpoint, version: e.version });
    else if (n.includes("mcp")) push({ kind: "MCP", endpoint: e.endpoint, version: e.version });
    else if (n.includes("erc8183")) push({ kind: "ERC8183", endpoint: e.endpoint });
    else if (n.includes("x402") || n === "q402") push({ kind: "x402", endpoint: e.endpoint });
    else if (n.includes("web") || n.includes("http")) push({ kind: "WEB", endpoint: e.endpoint });
  }

  // Capability flags with no endpoint are real but not addressable from the card.
  if ((card.x402Support === true || card.x402support === true) && !routes.some((r) => r.kind === "x402"))
    push({ kind: "x402", endpoint: null, note: "declared without endpoint" });

  const trust = ([] as unknown[])
    .concat(card.supportedTrust ?? [], card.supportedTrusts ?? [])
    .map((t) => String(t).toLowerCase());
  if (trust.some((t) => t.includes("8183")) && !routes.some((r) => r.kind === "ERC8183"))
    push({ kind: "ERC8183", endpoint: "onchain" });

  return routes;
}

// Ranked by how executable each surface actually turned out to be in testing.
const PREFERENCE: RouteKind[] = ["A2A", "MCP", "ERC8183", "x402", "WEB"];
export const bestRoute = (routes: Route[]): Route | null =>
  [...routes].sort((a, b) => PREFERENCE.indexOf(a.kind) - PREFERENCE.indexOf(b.kind))[0] ?? null;

// agentURI is legally either an https URL or an inline base64 data: URI.
export async function resolveCard(uri: string): Promise<{ card: AgentCard; via: "data-uri" | "https" }> {
  if (!uri) throw new Error("empty agentURI");
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    const meta = uri.slice(5, comma);
    const payload = uri.slice(comma + 1);
    const raw = meta.includes("base64")
      ? Buffer.from(payload, "base64").toString("utf8")
      : decodeURIComponent(payload);
    return { card: JSON.parse(raw) as AgentCard, via: "data-uri" };
  }
  if (/^https?:\/\//.test(uri)) {
    const r = await fetch(uri, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
    });
    if (!r.ok) throw new Error(`agentURI HTTP ${r.status}`);
    return { card: (await r.json()) as AgentCard, via: "https" };
  }
  throw new Error("unsupported agentURI scheme");
}

export async function discover(network: NetworkName, agentId: string | number | bigint): Promise<DiscoveredAgent> {
  const c = publicClientFor(network);
  const n = net(network);
  const id = BigInt(agentId);
  const [uri, owner] = await Promise.all([
    c.readContract({ address: n.registry, abi: identityAbi, functionName: "tokenURI", args: [id] }),
    c.readContract({ address: n.registry, abi: identityAbi, functionName: "ownerOf", args: [id] }),
  ]);
  const { card, via } = await resolveCard(uri);
  const routes = classify(card);
  return {
    agentId: id.toString(),
    chain: network,
    registry: n.registry,
    owner,
    uri,
    via,
    name: card.name ?? null,
    description: card.description ?? null,
    card,
    routes,
    route: bestRoute(routes),
  };
}

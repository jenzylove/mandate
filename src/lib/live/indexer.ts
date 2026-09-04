import type { Category } from "@/lib/domain/types";

// Candidate discovery through 8004scan, a public ERC-8004 indexer.
//
// This widens the pool we consider; it never decides what we show. The indexer
// reports what an agent's registration *claims* (name, declared protocols,
// x402 support). Whether an agent actually answers is something only we can
// establish, by contacting it, and that stays in qualify.ts.
//
// The hand-maintained roster is kept as a floor so a category is never empty
// because an index was slow or changed shape.

const BASE = (process.env.SCAN_API_BASE ?? "https://api.8004scan.io/api/v1").replace(/\/$/, "");
const BSC_CHAIN_ID = 56;
const TIMEOUT_MS = 12_000;

// What we are actually looking for, in the words an agent would use about
// itself rather than our internal category slugs.
const QUERIES: Record<Category, string> = {
  rebalancing:
    "portfolio rebalancing, restore target weights, costed against the pools that execute it",
  "grid-trading": "grid trading plan, grid levels and spacing for a liquidity pool",
  "yield-optimization":
    "yield optimisation, rank lending markets by real supply APY, whether moving capital pays",
  "health-factor-monitoring":
    "Venus health factor, liquidation distance, lending position risk monitoring",
};

export interface Candidate {
  agentId: string;
  name: string | null;
  declaredProtocols: string[];
  x402: boolean;
  source: "8004scan";
}

interface ScanAgent {
  token_id?: string | number;
  chain_id?: number;
  name?: string | null;
  supported_protocols?: string[] | null;
  x402_supported?: boolean | null;
  is_testnet?: boolean | null;
}

function headers(): Record<string, string> {
  const key = process.env.SCAN_API_KEY?.trim();
  return { accept: "application/json", ...(key ? { "x-api-key": key } : {}) };
}

function rowsFrom(payload: unknown): ScanAgent[] {
  const p = payload as { items?: unknown; data?: { items?: unknown } | unknown };
  if (Array.isArray(p?.items)) return p.items as ScanAgent[];
  const d = (p as { data?: { items?: unknown } }).data;
  if (Array.isArray(d)) return d as ScanAgent[];
  if (d && Array.isArray((d as { items?: unknown }).items)) return (d as { items: ScanAgent[] }).items;
  return [];
}

const toCandidate = (a: ScanAgent): Candidate | null => {
  const id = a.token_id != null ? String(a.token_id) : null;
  // Guard the chain explicitly: the index spans many chains and a filter that
  // is silently ignored would put another chain's agents in our market.
  if (!id || !/^\d+$/.test(id) || a.chain_id !== BSC_CHAIN_ID || a.is_testnet === true) return null;
  return {
    agentId: id,
    name: a.name ?? null,
    declaredProtocols: (a.supported_protocols ?? []).map(String),
    x402: a.x402_supported === true,
    source: "8004scan",
  };
};

async function get(url: URL): Promise<unknown | null> {
  try {
    const r = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

/** Semantic search for agents that describe themselves as doing this work. */
export async function candidatesForCategory(category: Category, limit = 8): Promise<Candidate[]> {
  const url = new URL(`${BASE}/agents/search/semantic`);
  url.searchParams.set("q", QUERIES[category]);
  url.searchParams.set("chain_id", String(BSC_CHAIN_ID));
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 25)));
  url.searchParams.set("semantic_weight", "0.65");

  const payload = await get(url);
  if (!payload) return [];

  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of rowsFrom(payload)) {
    const c = toCandidate(row);
    if (!c || seen.has(c.agentId)) continue;
    seen.add(c.agentId);
    out.push(c);
  }
  return out;
}

/** Is the indexer reachable at all? Used to report discovery health. */
export async function indexerReachable(): Promise<boolean> {
  const url = new URL(`${BASE}/agents`);
  url.searchParams.set("chain_id", String(BSC_CHAIN_ID));
  url.searchParams.set("limit", "1");
  return (await get(url)) !== null;
}

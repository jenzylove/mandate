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
  description: string | null;
  ownerAddress: string | null;
  declaredProtocols: string[];
  x402: boolean;
  verified: boolean;
  source: "8004scan";
  /** Which search surfaced it, kept so the funnel can be explained. */
  foundBy: string;
}

interface ScanAgent {
  token_id?: string | number;
  chain_id?: number;
  name?: string | null;
  description?: string | null;
  owner_address?: string | null;
  supported_protocols?: string[] | null;
  x402_supported?: boolean | null;
  is_testnet?: boolean | null;
  is_verified?: boolean | null;
}

function headers(): Record<string, string> {
  const key = process.env.SCAN_API_KEY?.trim();
  return { accept: "application/json", ...(key ? { "x-api-key": key } : {}) };
}

function rowsFrom(payload: unknown): ScanAgent[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as { items?: unknown; data?: { items?: unknown } | unknown };
  if (Array.isArray(p?.items)) return p.items as ScanAgent[];
  const d = (p as { data?: { items?: unknown } }).data;
  if (Array.isArray(d)) return d as ScanAgent[];
  if (d && Array.isArray((d as { items?: unknown }).items)) return (d as { items: ScanAgent[] }).items;
  return [];
}

const toCandidate = (a: ScanAgent, foundBy: string): Candidate | null => {
  const id = a.token_id != null ? String(a.token_id) : null;
  // Guard the chain explicitly: the index spans many chains and a filter that
  // is silently ignored would put another chain's agents in our market. The
  // API does ignore unknown query params, so this is not a theoretical risk.
  if (!id || !/^\d+$/.test(id) || a.chain_id !== BSC_CHAIN_ID || a.is_testnet === true) return null;
  return {
    agentId: id,
    name: a.name ?? null,
    description: a.description ?? null,
    ownerAddress: a.owner_address ? a.owner_address.toLowerCase() : null,
    declaredProtocols: (a.supported_protocols ?? []).map(String),
    x402: a.x402_supported === true,
    verified: a.is_verified === true,
    source: "8004scan",
    foundBy,
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

// The vocabulary a financial agent uses about itself. One phrasing finds one
// corner of the index, so each category is searched several ways: an agent that
// calls itself a "liquidation guard" and one that says "health factor monitor"
// are the same supply and neither query alone finds both.
const QUERY_VARIANTS: Record<Category, string[]> = {
  rebalancing: [
    QUERIES.rebalancing,
    "portfolio rebalance, target weights, drift correction",
    "asset allocation manager, index basket, reweight holdings",
    "portfolio manager agent for BNB Chain tokens",
  ],
  "grid-trading": [
    QUERIES["grid-trading"],
    "grid bot, range trading, buy low sell high ladder",
    "market making, spread capture, automated trading strategy",
    "DCA bot, dollar cost averaging, scheduled buys",
  ],
  "yield-optimization": [
    QUERIES["yield-optimization"],
    "yield farming, auto compound, best APY across lending markets",
    "staking rewards optimiser, vault strategy, liquidity mining",
    "PancakeSwap liquidity provision, fee tier selection, LP returns",
  ],
  "health-factor-monitoring": [
    QUERIES["health-factor-monitoring"],
    "liquidation protection, collateral ratio guard, auto repay",
    "lending position monitor, loan to value, borrow risk alerts",
    "Venus protocol position safety, margin call prevention",
  ],
};

const MAX_PAGE = 100; // the index refuses more

/** One semantic page. Retries once: the API returns transient DATABASE_ERROR. */
async function semanticPage(q: string, offset: number, limit: number): Promise<ScanAgent[]> {
  const url = new URL(`${BASE}/agents/search/semantic`);
  url.searchParams.set("q", q);
  url.searchParams.set("chain_id", String(BSC_CHAIN_ID));
  url.searchParams.set("limit", String(Math.min(limit, MAX_PAGE)));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("semantic_weight", "0.65");
  for (let attempt = 0; attempt < 4; attempt++) {
    const payload = await get(url);
    // The index intermittently answers DATABASE_ERROR; a null payload is that,
    // not an exhausted page, so it is retried rather than read as the end.
    if (payload) return rowsFrom(payload);
    await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
  }
  return [];
}

/** Semantic search for agents that describe themselves as doing this work. */
export async function candidatesForCategory(category: Category, limit = 8): Promise<Candidate[]> {
  const rows = await semanticPage(QUERIES[category], 0, Math.min(Math.max(limit, 1), MAX_PAGE));
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const row of rows) {
    const c = toCandidate(row, category);
    if (!c || seen.has(c.agentId)) continue;
    seen.add(c.agentId);
    out.push(c);
  }
  return out;
}

/**
 * The broad sweep: every phrasing of every category, paginated, deduped.
 *
 * This is the top of the funnel and is deliberately wide. Nothing here decides
 * what the marketplace shows; it decides what is worth contacting.
 */
export async function sweepCandidates({
  perQuery = 200,
  onProgress,
}: {
  perQuery?: number;
  onProgress?: (note: string) => void;
} = {}): Promise<Map<string, Candidate & { categories: Set<Category> }>> {
  const found = new Map<string, Candidate & { categories: Set<Category> }>();

  for (const [category, variants] of Object.entries(QUERY_VARIANTS) as [Category, string[]][]) {
    for (const q of variants) {
      let offset = 0;
      let taken = 0;
      for (;;) {
        const rows = await semanticPage(q, offset, MAX_PAGE);
        if (!rows.length) break;
        for (const row of rows) {
          const c = toCandidate(row, q);
          if (!c) continue;
          const existing = found.get(c.agentId);
          if (existing) existing.categories.add(category);
          else found.set(c.agentId, { ...c, categories: new Set([category]) });
        }
        taken += rows.length;
        offset += rows.length;
        if (rows.length < MAX_PAGE || taken >= perQuery) break;
      }
      onProgress?.(`${category} · "${q.slice(0, 44)}" → ${found.size} unique so far`);
    }
  }
  return found;
}

/**
 * Walk the registry itself, newest first.
 *
 * Semantic search finds agents that describe themselves the way we phrased the
 * question, and its result sets overlap heavily: four phrasings of one category
 * returned barely more unique agents than one. This reads raw pages instead and
 * filters locally, which finds supply whose wording we never guessed. The index
 * ignores unknown query params, so the filtering has to happen here.
 */
export async function scanRecent({
  pages = 40,
  onProgress,
}: { pages?: number; onProgress?: (note: string) => void } = {}): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < pages; page++) {
    const url = new URL(`${BASE}/agents`);
    url.searchParams.set("chain_id", String(BSC_CHAIN_ID));
    url.searchParams.set("limit", String(MAX_PAGE));
    url.searchParams.set("offset", String(page * MAX_PAGE));

    let rows: ScanAgent[] = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const payload = await get(url);
      if (payload) { rows = rowsFrom(payload); break; }
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
    if (!rows.length) break;

    for (const row of rows) {
      const c = toCandidate(row, "registry-scan");
      if (!c || seen.has(c.agentId)) continue;
      seen.add(c.agentId);
      out.push(c);
    }
    if (page % 10 === 9) onProgress?.(`registry scan: ${(page + 1) * MAX_PAGE} rows read, ${out.length} on BSC`);
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

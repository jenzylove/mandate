import type { Category } from "@/lib/domain/types";
import { REQUIRED_CATEGORIES } from "@/lib/domain/types";
import { sweepCandidates, scanRecent, type Candidate } from "@/lib/live/indexer";
import { buildOne, type LiveAgent } from "@/lib/live/qualify";
import { callTool, quote } from "@/lib/live/agent-adapter";
import { rosterEntry } from "@/lib/live/roster";
import type { RosterEntry } from "@/lib/live/roster";
import { ROSTER } from "@/lib/live/roster";

// The qualification funnel, top to bottom.
//
// A large BSC universe is searched broadly, each candidate is filtered on what
// the index already tells us, and only what survives is contacted. Nothing is
// admitted to the marketplace because it exists: it is admitted because it
// answered, because it does financial work, and because Mandate either got a
// real quote from it or actually ran one of its tools.
//
// Every rejection is recorded with its reason. A funnel that only reports its
// survivors is a claim, not evidence.

export type RejectReason =
  | "not-bsc-mainnet"
  | "declares-no-callable-protocol"
  | "not-financially-relevant"
  | "registration-unresolved"
  | "no-callable-route"
  | "endpoint-not-answering"
  | "no-quote-and-no-free-output"
  | "operator-cap-reached";

export interface Funnel {
  candidatesConsidered: number;
  afterProtocolFilter: number;
  afterRelevanceFilter: number;
  probed: number;
  answering: number;
  paidWithQuote: number;
  freeWithOutput: number;
  qualified: number;
  perCategory: Record<string, number>;
  distinctOperators: number;
  rejections: Record<string, number>;
  startedAt: string;
  finishedAt: string;
}

// A registration that names no protocol we can call is not supply. "Web" is a
// profile page, which is most of the registry and none of the marketplace.
const CALLABLE_PROTOCOL = /^(a2a|mcp|x402|erc-?8183|erc-?8004)$/i;
const declaresCallableProtocol = (c: Candidate) =>
  c.x402 || c.declaredProtocols.some((p) => CALLABLE_PROTOCOL.test(p.trim()));

// Financial relevance, judged on what the agent says about itself. Broad on
// purpose: the endpoint probe is the expensive gate, this only avoids paying it
// for an agent that is plainly something else.
const FINANCE = [
  "rebalanc", "portfolio", "allocation", "weight", "grid", "trading", "trade",
  "market mak", "arbitrage", "dca", "yield", "apy", "apr", "compound", "staking",
  "vault", "liquidity", "lending", "borrow", "collateral", "health factor",
  "liquidation", "ltv", "venus", "pancakeswap", "defi", "swap", "position",
  "treasury", "risk", "hedge", "stablecoin", "pool", "lp ", "perp", "leverage",
];
const looksFinancial = (c: Candidate) => {
  const text = `${c.name ?? ""} ${c.description ?? ""}`.toLowerCase();
  return FINANCE.some((k) => text.includes(k));
};

/**
 * Did Mandate prove it can actually transact with this agent?
 *
 * Paid means a quote came back accepted, with a positive price and a payout
 * address to escrow against. Free means a named tool or skill was called and
 * returned real output. Anything else answered a socket and proved nothing, and
 * is not primary marketplace inventory whatever its endpoint said.
 */
export type Hireability = "paid" | "free" | "unproven";

export function hireabilityOf(agent: LiveAgent): Hireability {
  const q = agent.live.quote;
  if (q?.accepted && q.provider && BigInt(q.priceRaw ?? "0") > 0n) return "paid";
  if (q?.accepted && q.priceRaw === "0" && q.deliverables) return "free";
  return "unproven";
}

const CATEGORY_WORDS: [Category, RegExp][] = [
  ["health-factor-monitoring", /health factor|liquidat|collateral|ltv|borrow|lending|venus/i],
  ["grid-trading", /grid|market mak|arbitrage|dca|range trad|spread/i],
  ["rebalancing", /rebalanc|allocation|target weight|portfolio|basket|drift/i],
  ["yield-optimization", /yield|apy|apr|compound|staking|vault|liquidity|farm/i],
];

// A candidate found by semantic search carries the category that found it. One
// found by scanning the registry does not, so it is read from its own words.
const categoryFor = (cats: Set<Category>, text = ""): Category => {
  const fromQuery = REQUIRED_CATEGORIES.find((c) => cats.has(c));
  if (fromQuery) return fromQuery;
  return CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0] ?? "yield-optimization";
};

export interface SweepResult {
  agents: LiveAgent[];
  /** How many of them Mandate proved it can actually pay or run. */
  hireableCount: number;
  funnel: Funnel;
  rejected: { agentId: string; name: string | null; reason: RejectReason; detail?: string }[];
}

export async function runMarketSweep({
  perQuery = 200,
  maxProbes = 400,
  concurrency = 6,
  maxPerOperator = 6,
  pauseMs = 700,
  registryPages = 40,
  skipDiscovery = false,
  extraIds = [],
  onProgress = () => {},
}: {
  perQuery?: number;
  registryPages?: number;
  maxProbes?: number;
  concurrency?: number;
  maxPerOperator?: number;
  /** Breather between probe batches. Sweeping too hard makes healthy agents
   *  look offline, which then reads as the market shrinking. */
  pauseMs?: number;
  /** Re-grade what is already known without touching the index. */
  skipDiscovery?: boolean;
  /** Agent ids to always probe, such as everything in the current snapshot. */
  extraIds?: { agentId: string; category: Category }[];
  onProgress?: (note: string) => void;
} = {}): Promise<SweepResult> {
  const startedAt = new Date().toISOString();
  const rejections: Record<string, number> = {};
  const rejected: SweepResult["rejected"] = [];
  const reject = (agentId: string, name: string | null, reason: RejectReason, detail?: string) => {
    rejections[reason] = (rejections[reason] ?? 0) + 1;
    rejected.push({ agentId, name, reason, detail });
  };

  // Re-qualification without discovery. The index is a third-party service and
  // is sometimes down or rate-limiting; when it is, the agents already known
  // can still be re-probed, re-quoted and re-graded. That keeps the snapshot's
  // semantics current even when nothing new can be found.
  const discovered = skipDiscovery
    ? new Map<string, Candidate & { categories: Set<Category> }>()
    : await (async () => {
        onProgress("searching the index…");
        return sweepCandidates({ perQuery, onProgress });
      })();

  // Semantic search only finds agents phrased the way we asked. Reading raw
  // registry pages as well catches supply whose wording we never guessed.
  if (!skipDiscovery) {
  onProgress("scanning recent registrations…");
  for (const c of await scanRecent({ pages: registryPages, onProgress })) {
    if (!discovered.has(c.agentId)) {
      discovered.set(c.agentId, { ...c, categories: new Set<Category>() });
    }
  }
  }
  const candidatesConsidered = discovered.size + extraIds.length;

  // Cheap filters first, so the expensive probe is spent on plausible supply.
  const withProtocol = [...discovered.values()].filter((c) => {
    if (declaresCallableProtocol(c)) return true;
    reject(c.agentId, c.name, "declares-no-callable-protocol", c.declaredProtocols.join(",") || "none");
    return false;
  });

  const relevant = withProtocol.filter((c) => {
    if (looksFinancial(c)) return true;
    reject(c.agentId, c.name, "not-financially-relevant");
    return false;
  });

  // The maintained roster is always probed: it is the floor that keeps a
  // category from emptying because an index changed shape.
  const rosterIds = new Set(ROSTER.map((r) => r.agentId));
  const extras: RosterEntry[] = extraIds
    .filter((e) => !rosterIds.has(e.agentId))
    .map((e) => {
      rosterIds.add(e.agentId);
      return { agentId: e.agentId, category: e.category, protocols: ["BNB Chain"], assets: ["BNB", "USDT", "USDC"] };
    });
  const queue: RosterEntry[] = [
    ...ROSTER,
    ...extras,
    ...relevant
      .filter((c) => !rosterIds.has(c.agentId))
      .slice(0, Math.max(0, maxProbes - ROSTER.length))
      .map<RosterEntry>((c) => ({
        agentId: c.agentId,
        category: categoryFor(c.categories, `${c.name ?? ""} ${c.description ?? ""}`),
        protocols: ["BNB Chain"],
        assets: ["BNB", "USDT", "USDC"],
      })),
  ];

  onProgress(`probing ${queue.length} candidates…`);
  const built: LiveAgent[] = [];
  let probed = 0;
  for (let i = 0; i < queue.length; i += concurrency) {
    const batch = await Promise.all(
      queue.slice(i, i + concurrency).map(async (entry) => {
        try {
          return await buildOne(entry);
        } catch {
          return null;
        }
      }),
    );
    for (let k = 0; k < batch.length; k++) {
      probed++;
      const agent = batch[k];
      const entry = queue[i + k];
      if (!agent) {
        reject(entry.agentId, null, "registration-unresolved");
        continue;
      }
      built.push(agent);
    }
    onProgress(`probed ${probed}/${queue.length} · ${built.length} resolved`);
    if (i + concurrency < queue.length) await new Promise((r) => setTimeout(r, pauseMs));
  }

  const answering = built.filter((a) => {
    if (a.status !== "offline") return true;
    reject(a.live.agentId, a.name, "endpoint-not-answering", a.live.probe.detail);
    return false;
  });

  // The gate that matters: a proven paid quote, or a tool we actually ran.
  //
  // Both are attempted across every route the agent declares, not just the one
  // the router happens to prefer. Preferring A2A and stopping there was hiding
  // real supply: an agent whose A2A endpoint is a static card but whose MCP
  // server answers is hireable, and was being rejected for the accident of
  // which transport was listed first.
  onProgress("proving each answering agent is paid or free…");
  const hireable: LiveAgent[] = [];
  const listedOnly: LiveAgent[] = [];
  const proof = new Map<string, string>();

  for (let i = 0; i < answering.length; i += concurrency) {
    const batch = await Promise.all(
      answering.slice(i, i + concurrency).map(async (a) => {
        if (hireabilityOf(a) === "paid") return { a, ok: true as const, note: "quote accepted" };

        // A named skill quotes better than a generic sentence: an agent that
        // sells one thing often refuses anything it cannot recognise.
        const skills = a.live.probe.skills ?? [];
        for (const route of a.live.routes.filter((r) => r.kind === "A2A" && r.endpoint)) {
          for (const skill of [a.live.serviceId, ...skills].filter(Boolean).slice(0, 3)) {
            try {
              const q = await quote(route, `${a.category.replaceAll("-", " ")} for a BNB Chain position`, skill!);
              if (q.accepted && q.provider && BigInt(q.priceRaw ?? "0") > 0n) {
                a.live.quote = {
                  accepted: true, priceRaw: q.priceRaw, priceDisplay: q.priceDisplay,
                  currency: q.currency, provider: q.provider, needs: q.needs,
                  deliverables: q.deliverables, chainId: q.chainId,
                  verifyingContract: q.verifyingContract, paymentToken: q.paymentToken,
                  estimatedSeconds: q.estimatedSeconds,
                };
                a.pricing = q.priceDisplay ?? `${Number(q.priceRaw) / 1e18} ${q.currency ?? "U"}`;
                return { a, ok: true as const, note: `quote accepted for ${skill}` };
              }
            } catch { /* this skill is not quotable */ }
          }
        }

        // Free means a tool actually ran and returned something.
        const mcp = a.live.routes.find((r) => r.kind === "MCP" && r.endpoint);
        if (mcp) {
          const named = rosterEntry(a.live.agentId)?.evidenceTool;
          const tools = named ? [named, ...(a.live.probe.tools ?? [])] : (a.live.probe.tools ?? []);
          for (const tool of tools.slice(0, 4)) {
            try {
              const out = await callTool(mcp, tool, {});
              if (out.ok && out.text.trim().length > 2) {
                a.live.quote = {
                  accepted: true, priceRaw: "0", priceDisplay: "Free", currency: "U",
                  deliverables: `${tool} returned ${out.text.trim().length} characters`,
                };
                a.pricing = "Free";
                return { a, ok: true as const, note: `${tool} returned real output` };
              }
            } catch { /* try the next tool */ }
          }
        }
        return { a, ok: false as const, why: a.live.probe.detail };
      }),
    );
    for (const r of batch) {
      if (r.ok) {
        r.a.live.hireability = hireabilityOf(r.a);
        hireable.push(r.a);
        proof.set(r.a.live.agentId, r.note);
      } else {
        // It answered and it is real, but Mandate could not obtain a price or
        // run anything on it. That is not primary inventory and is not deleted
        // either: it is listed as unproven, ranked last, and says so.
        r.a.live.hireability = "unproven";
        r.a.pricing = "No price quoted";
        listedOnly.push(r.a);
        reject(r.a.live.agentId, r.a.name, "no-quote-and-no-free-output", r.why);
      }
    }
    onProgress(`proved ${hireable.length}/${Math.min(i + concurrency, answering.length)}`);
    if (i + concurrency < answering.length) await new Promise((r) => setTimeout(r, pauseMs));
  }

  // Multiple genuine services from one operator are legitimate supply and are
  // kept; an operator monopolising the catalogue is not.
  const perOperator = new Map<string, number>();
  const qualified: LiveAgent[] = [];
  for (const a of hireable) {
    const op = a.owner.toLowerCase();
    const n = perOperator.get(op) ?? 0;
    if (n >= maxPerOperator) {
      reject(a.live.agentId, a.name, "operator-cap-reached", op);
      continue;
    }
    perOperator.set(op, n + 1);
    qualified.push(a);
  }

  const perCategory: Record<string, number> = {};
  for (const a of qualified) perCategory[a.category] = (perCategory[a.category] ?? 0) + 1;

  return {
    // Proven inventory leads; everything that merely answered follows it.
    agents: [...interleaveByOperator(qualified), ...interleaveByOperator(listedOnly)],
    hireableCount: qualified.length,
    rejected,
    funnel: {
      candidatesConsidered,
      afterProtocolFilter: withProtocol.length,
      afterRelevanceFilter: relevant.length,
      probed,
      answering: answering.length,
      paidWithQuote: qualified.filter((a) => hireabilityOf(a) === "paid").length,
      freeWithOutput: qualified.filter((a) => hireabilityOf(a) === "free").length,
      qualified: qualified.length,
      perCategory,
      distinctOperators: perOperator.size,
      rejections,
      startedAt,
      finishedAt: new Date().toISOString(),
    },
  };
}

/**
 * Round-robin the catalogue by operator, so the top of the list shows the
 * market rather than whoever registered the most services. Every agent is
 * kept; only the order changes.
 */
export function interleaveByOperator(agents: LiveAgent[]): LiveAgent[] {
  const byOperator = new Map<string, LiveAgent[]>();
  for (const a of agents) {
    const op = a.owner.toLowerCase();
    const list = byOperator.get(op) ?? [];
    list.push(a);
    byOperator.set(op, list);
  }
  // Within an operator, its most complete listing leads.
  for (const list of byOperator.values()) {
    list.sort((x, y) => rank(y) - rank(x));
  }
  const queues = [...byOperator.values()].sort((a, b) => rank(b[0]) - rank(a[0]));

  const out: LiveAgent[] = [];
  for (let round = 0; out.length < agents.length; round++) {
    let moved = false;
    for (const q of queues) {
      const next = q[round];
      if (next) {
        out.push(next);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

const rank = (a: LiveAgent) =>
  (a.status === "available" ? 100 : a.status === "limited" ? 40 : 0) +
  (a.live.quote?.accepted ? 40 : 0) +
  (a.image ? 15 : 0) +
  Math.min(20, a.capabilities.length * 3);

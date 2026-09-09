import type { HireContext } from "@/lib/domain/types";
import { liveAgent } from "@/lib/live/snapshot";
import {
  quote,
  resolveCallableRoute,
  type Quote,
} from "@/lib/live/agent-adapter";
import type { LiveAgent } from "@/lib/live/qualify";
import {
  identityAbi,
  net,
  NETWORKS,
  publicClientFor,
  type NetworkName,
} from "@/lib/live/chain";
import { settlementFor } from "@/lib/settlement/erc8183";
import type { Route } from "@/lib/live/discover";

export type MissingFieldType = "text" | "number" | "wallet";

export interface MissingField {
  key: string;
  label: string;
  type: MissingFieldType;
}

export type NegotiationStatus = "ready" | "needs-input" | "unavailable";

export interface SettlementCheck {
  compatible: boolean;
  network: NetworkName;
  expectedToken?: string;
  quotedToken?: string;
  reason?: string;
}

export interface NegotiationResult {
  status: NegotiationStatus;
  mode: "paid" | "free" | null;
  agent: LiveAgent | null;
  route: Route | null;
  quote?: Quote;
  missingFields: MissingField[];
  provider?: string;
  network?: NetworkName;
  checkedAt: string;
  reason?: string;
  settlement?: SettlementCheck;
}

export interface NegotiationOptions {
  /** Unit tests can replace the chain read; production always validates it. */
  checkSettlement?: boolean;
  resolveProvider?: (agent: LiveAgent, quote: Quote) => Promise<string | undefined>;
}

export class NegotiationRequiredError extends Error {
  readonly result: NegotiationResult;

  constructor(result: NegotiationResult) {
    super(result.reason ?? "The agent needs more information before it can be hired.");
    this.name = "NegotiationRequiredError";
    this.result = result;
  }
}

export class TermsChangedError extends Error {
  readonly result: NegotiationResult;

  constructor(result: NegotiationResult) {
    super("The agent returned different executable terms. Review the fresh quote before funding.");
    this.name = "TermsChangedError";
    this.result = result;
  }
}

const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) && BigInt(value) !== 0n;

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const networkForChainId = (id?: number): NetworkName | null => {
  const hit = (Object.entries(NETWORKS) as [NetworkName, { chainId: number }][]).find(
    ([, network]) => network.chainId === id,
  );
  return hit?.[0] ?? null;
};

function defaultRequest(agent: LiveAgent): string {
  return `${agent.category.replaceAll("-", " ")} for a position on BNB Smart Chain`;
}

function labelFor(key: string): string {
  const known: Record<string, string> = {
    wallet: "Wallet address",
    buyer: "Wallet address",
    address: "Wallet address",
    account: "Wallet address",
    pair: "Token pair",
    token_pair: "Token pair",
    quote_asset: "Quote asset",
    quoteAsset: "Quote asset",
    asset: "Asset",
    amount: "Amount",
    protocol: "Protocol",
    position: "Position",
    risk: "Risk preference",
    control: "Control mode",
  };
  return known[key] ?? key.replaceAll(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldTypeFor(key: string): MissingFieldType {
  const normalized = key.replaceAll(/[-_]/g, "").toLowerCase();
  if (["wallet", "buyer", "address", "account"].includes(normalized)) return "wallet";
  if (["amount", "quantity", "size"].includes(normalized)) return "number";
  return "text";
}

function canonicalKey(key: string): string {
  const normalized = key.replaceAll(/[-_ ]/g, "").toLowerCase();
  if (["wallet", "buyer", "address", "account", "client"].includes(normalized)) return "buyer";
  if (["tokenpair", "market", "tradingpair"].includes(normalized)) return "pair";
  if (["quoteasset", "quote"].includes(normalized)) return "quoteAsset";
  return key;
}

function contextHas(context: HireContext, key: string): boolean {
  const wanted = canonicalKey(key);
  if (wanted === "buyer") return Boolean(nonEmpty(context.buyer));
  return Object.entries(context).some(([candidate, value]) =>
    canonicalKey(candidate) === wanted && value !== undefined && value !== null && value !== "",
  );
}

function missingFields(needs: Record<string, string> | undefined, context: HireContext): MissingField[] {
  if (!needs) return [];
  return Object.entries(needs)
    .filter(([, description]) => !/\boptional\b/i.test(description))
    .filter(([key]) => !contextHas(context, key))
    .map(([key, description]) => ({
      key,
      label: description || labelFor(key),
      type: fieldTypeFor(key),
    }));
}

function negotiationParams(context: HireContext, request: string): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    if (value !== undefined && value !== null && value !== "") params[key] = value;
  }
  const buyer = nonEmpty(context.buyer);
  const requestedDeliverable = nonEmpty(context.requestedDeliverable) ?? request;
  params.request = request;
  params.requested_deliverable = requestedDeliverable;
  params.task_description = request;
  // IVL and several other A2A sellers require this field even when they do
  // not yet know whether more business inputs are needed. It describes the
  // requested response, not a fabricated business value.
  params.quality_standards =
    nonEmpty(context.quality_standards) ??
    `Return ${requestedDeliverable} and state any missing inputs.`;
  if (buyer) {
    params.buyer = buyer;
    params.wallet = buyer;
    params.address = buyer;
    params.account = buyer;
  }
  return params;
}

async function registryProvider(agent: LiveAgent): Promise<string | undefined> {
  try {
    const client = publicClientFor(agent.live.network as NetworkName);
    const wallet = await client.readContract({
      address: net(agent.live.network as NetworkName).registry,
      abi: identityAbi,
      functionName: "getAgentWallet",
      args: [BigInt(agent.live.agentId)],
    });
    if (isAddress(wallet)) return wallet;
  } catch {
    // A provider wallet is not implemented by every ERC-8004 registry. The
    // owner is still a verifiable identity and is the last-resort payout
    // address, never an arbitrary generated value.
  }
  return isAddress(agent.owner) ? agent.owner : undefined;
}

function quoteToken(q: Quote): string | undefined {
  const token = q.paymentToken ?? q.currency;
  return isAddress(token) ? token : undefined;
}

function positivePrice(q: Quote): boolean {
  if (!q.accepted || !q.priceRaw) return false;
  try {
    return BigInt(q.priceRaw) > 0n;
  } catch {
    return false;
  }
}

async function validateSettlement(
  network: NetworkName,
  q: Quote,
  checkSettlement: boolean,
): Promise<SettlementCheck> {
  const quotedToken = quoteToken(q);
  if (!checkSettlement) return { compatible: true, network, quotedToken };

  const expectedContract = net(network).commerce.toLowerCase();
  if (q.verifyingContract && q.verifyingContract.toLowerCase() !== expectedContract) {
    return {
      compatible: false,
      network,
      quotedToken,
      reason: `agent quoted verifying contract ${q.verifyingContract}, but Mandate settles on ${net(network).commerce}`,
    };
  }

  if (!quotedToken) return { compatible: true, network };
  try {
    const token = await settlementFor(network).token();
    const expectedToken = token.address.toLowerCase();
    if (expectedToken !== quotedToken.toLowerCase()) {
      return {
        compatible: false,
        network,
        expectedToken: token.address,
        quotedToken,
        reason: `agent quoted payment token ${quotedToken}, but Mandate's ERC-8183 contract accepts ${token.address}`,
      };
    }
    return { compatible: true, network, expectedToken: token.address, quotedToken };
  } catch (error) {
    return {
      compatible: false,
      network,
      quotedToken,
      reason: `could not validate the ERC-8183 payment token: ${(error as Error).message}`,
    };
  }
}

/** One live commerce pipeline shared by preflight and final hire. */
export async function negotiateHire(
  agentId: string,
  context: HireContext = {},
  options: NegotiationOptions = {},
): Promise<NegotiationResult> {
  const checkedAt = new Date().toISOString();
  const agent = await liveAgent(agentId);
  if (!agent) {
    return {
      status: "unavailable",
      mode: null,
      agent: null,
      route: null,
      missingFields: [],
      checkedAt,
      reason: "This agent is not in the current marketplace snapshot.",
    };
  }
  if (agent.status === "offline") {
    return {
      status: "unavailable",
      mode: null,
      agent,
      route: agent.live.route,
      missingFields: [],
      checkedAt,
      reason: `${agent.name} is not answering right now.`,
    };
  }

  const route = agent.live.route ? await resolveCallableRoute(agent.live.route) : null;
  if (!route) {
    return {
      status: "unavailable",
      mode: null,
      agent,
      route: null,
      missingFields: [],
      checkedAt,
      reason: `${agent.name} has no callable route in its current registration.`,
    };
  }

  const request = nonEmpty(context.request) ?? defaultRequest(agent);
  let q: Quote;
  try {
    q = await quote(route, request, agent.live.serviceId, negotiationParams(context, request));
  } catch (error) {
    return {
      status: "unavailable",
      mode: null,
      agent,
      route,
      missingFields: [],
      checkedAt,
      reason: `Live negotiation failed: ${(error as Error).message}`,
    };
  }

  const missing = missingFields(q.needs, context);
  if (missing.length) {
    return {
      status: "needs-input",
      mode: positivePrice(q) ? "paid" : "free",
      agent,
      route,
      quote: q,
      missingFields: missing,
      checkedAt,
      reason: `${agent.name} needs a few details before it can return executable terms.`,
    };
  }

  const paid = positivePrice(q);
  const free = q.accepted && q.priceRaw === "0" && Boolean(q.deliverables || q.service);
  if (free) {
    return {
      status: "ready",
      mode: "free",
      agent,
      route,
      quote: q,
      missingFields: [],
      checkedAt,
      reason: "The agent returned a callable free result.",
    };
  }
  if (!paid) {
    return {
      status: "unavailable",
      mode: "paid",
      agent,
      route,
      quote: q,
      missingFields: [],
      checkedAt,
      reason: `${agent.name} answered live but did not return an accepted paid quote or a callable free result.`,
    };
  }

  const provider = isAddress(q.provider)
    ? q.provider
    : await (options.resolveProvider?.(agent, q) ?? registryProvider(agent));
  if (!provider || !isAddress(provider)) {
    return {
      status: "unavailable",
      mode: "paid",
      agent,
      route,
      quote: q,
      missingFields: [],
      checkedAt,
      reason: "The live quote did not identify a valid provider payout address.",
    };
  }

  const network = networkForChainId(q.chainId) ?? (agent.live.network as NetworkName);
  const settlement = await validateSettlement(network, q, options.checkSettlement !== false);
  if (!settlement.compatible) {
    return {
      status: "unavailable",
      mode: "paid",
      agent,
      route,
      quote: { ...q, provider },
      provider,
      network,
      settlement,
      missingFields: [],
      checkedAt,
      reason: settlement.reason,
    };
  }

  return {
    status: "ready",
    mode: "paid",
    agent,
    route,
    quote: { ...q, provider },
    provider,
    network,
    settlement,
    missingFields: [],
    checkedAt,
    reason: "The agent returned a fresh executable quote.",
  };
}

export function quoteFingerprint(q: Quote | undefined): string {
  if (!q) return "";
  return [q.priceRaw ?? "", q.provider ?? "", q.chainId ?? "", q.paymentToken ?? q.currency ?? "", q.verifyingContract ?? ""].join("|").toLowerCase();
}

import { keccak256, toHex, type Hex } from "viem";
import { promises as fs } from "node:fs";
import path from "node:path";
import { liveAgent } from "@/lib/live/snapshot";
import { quote, callTool, notifyFunded } from "@/lib/live/agent-adapter";
import { settlement, type SettlementResult } from "@/lib/settlement/erc8183";
import { rosterEntry } from "@/lib/live/roster";
import { SETTLEMENT_NETWORK, net } from "@/lib/live/chain";

// What a hire actually produces. Every field says where it came from, because
// discovery and negotiation happen on mainnet while escrow settles on testnet,
// and a receipt that blurs the two would be dishonest.

export type DeliveryKind = "agent-output" | "negotiated-quote";

export interface Receipt {
  id: string;
  jobId: string;
  agentId: string;
  agentName: string;
  category: string;
  buyer: string | null;
  outcomeId?: string;
  createdAt: string;
  settledAt?: string;
  status: string;
  settlementNetwork: string;
  settlementLabel: string;
  discoveryNetwork: string;
  price: { raw: string; display: string; currency: string; quotedByAgent: boolean };
  provider: { quotedAddress?: string; escrowAddress: string };
  delivery: {
    kind: DeliveryKind;
    label: string;
    content: string;
    hash: string;
  };
  chain: SettlementResult;
  caveats: string[];
}

const RECEIPTS = path.join(process.cwd(), "data", "receipts");

export async function saveReceipt(r: Receipt) {
  await fs.mkdir(RECEIPTS, { recursive: true });
  await fs.writeFile(path.join(RECEIPTS, `${r.jobId}.json`), JSON.stringify(r, null, 2), "utf8");
}

export async function readReceipt(jobId: string): Promise<Receipt | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(RECEIPTS, `${jobId}.json`), "utf8")) as Receipt;
  } catch {
    return null;
  }
}

export async function listReceipts(buyer?: string): Promise<Receipt[]> {
  try {
    const files = await fs.readdir(RECEIPTS);
    const all = await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => JSON.parse(await fs.readFile(path.join(RECEIPTS, f), "utf8")) as Receipt),
    );
    const rows = buyer ? all.filter((r) => r.buyer?.toLowerCase() === buyer.toLowerCase()) : all;
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

/**
 * Get something real back from the agent.
 *
 * Where the agent exposes read-only MCP tools we call one and record its actual
 * output. Where it only sells work behind mainnet escrow, we record the quote it
 * signed for this request. We never invent a deliverable.
 */
async function obtainDelivery(
  agent: NonNullable<Awaited<ReturnType<typeof liveAgent>>>,
  request: string,
  params: Record<string, unknown>,
): Promise<{ kind: DeliveryKind; label: string; content: string; quotedProvider?: string; priceRaw?: string; priceDisplay?: string; quotedByAgent: boolean }> {
  const entry = rosterEntry(agent.live.agentId);
  const mcp = agent.live.routes.find((r) => r.kind === "MCP" && r.endpoint);

  // Preferred: real output from a free, read-only tool.
  if (mcp && entry?.evidenceTool) {
    const out = await callTool(mcp, entry.evidenceTool, (params.toolArgs as Record<string, unknown>) ?? entry.evidenceArgs ?? {});
    if (out.ok && out.text) {
      return {
        kind: "agent-output",
        label: `Live output from the agent's ${entry.evidenceTool} tool`,
        content: out.text.slice(0, 20_000),
        quotedByAgent: false,
      };
    }
  }

  // Otherwise: a real negotiation, recorded as the deliverable.
  const route = agent.live.route!;
  const q = await quote(route, request, agent.live.serviceId);
  const body = {
    request,
    accepted: q.accepted,
    service: q.service,
    category: q.category,
    price: q.priceDisplay ?? q.priceRaw,
    currency: q.currency,
    provider: q.provider,
    deliverables: q.deliverables,
    needs: q.needs,
    chain_id: q.chainId,
    verifying_contract: q.verifyingContract,
    payment_token: q.paymentToken,
    negotiated_at: new Date().toISOString(),
  };
  return {
    kind: "negotiated-quote",
    label: "Quote negotiated live with the agent over A2A",
    content: JSON.stringify(body, null, 2),
    quotedProvider: q.provider,
    priceRaw: q.priceRaw,
    priceDisplay: q.priceDisplay,
    quotedByAgent: q.accepted,
  };
}

export interface HireInput {
  agentId: string;
  buyer?: string | null;
  outcomeId?: string;
  request?: string;
  params?: Record<string, unknown>;
}

export async function hire(input: HireInput): Promise<Receipt> {
  const agent = await liveAgent(input.agentId);
  if (!agent) throw new Error(`No live agent ${input.agentId}`);
  if (agent.status === "offline")
    throw new Error(`${agent.name} is not answering right now, so it cannot be hired`);

  const request =
    input.request ?? `${agent.category.replaceAll("-", " ")} for a position on BNB Smart Chain`;

  const delivery = await obtainDelivery(agent, request, input.params ?? {});
  const deliverableHash = keccak256(toHex(delivery.content)) as Hex;

  // Escrow the job. The budget is the agent's own quoted price where it gave
  // one, so the escrowed amount is not a number we made up.
  const budgetRaw = BigInt(agent.live.quote?.priceRaw ?? delivery.priceRaw ?? "0");
  const n = net(SETTLEMENT_NETWORK);

  const description = JSON.stringify({
    schema: "mandate/hire/v1",
    agentId: agent.live.agentId,
    agentName: agent.name,
    category: agent.category,
    buyer: input.buyer ?? null,
    outcomeId: input.outcomeId ?? null,
    request,
    deliveryKind: delivery.kind,
    discoveryNetwork: agent.live.network,
  });

  const chain = await settlement.openAndDeliver({ budgetRaw, description, deliverableHash });

  // Tell an A2A seller its job is funded. Harmless on testnet (the seller is
  // watching mainnet), but it is the real protocol step and its answer is kept.
  let notified: string | undefined;
  if (agent.live.route?.kind === "A2A" && budgetRaw > 0n) {
    const res = await notifyFunded(agent.live.route, chain.jobId, { network: SETTLEMENT_NETWORK });
    notified = res.ok ? res.text.slice(0, 2000) : `not acknowledged: ${res.text.slice(0, 200)}`;
  }

  const caveats: string[] = [];
  if (SETTLEMENT_NETWORK !== agent.live.network) {
    caveats.push(
      `Discovery and negotiation ran on ${agent.live.network}; escrow settled on ${SETTLEMENT_NETWORK} with test funds. Paying this agent for production work requires a mainnet job.`,
    );
  }
  if (delivery.kind === "negotiated-quote") {
    caveats.push(
      "The deliverable is the agent's own live quote for this request, not finished work. This agent only performs paid work against mainnet escrow.",
    );
  }
  if (notified) caveats.push(`Seller notification: ${notified.slice(0, 300)}`);

  const receipt: Receipt = {
    id: `receipt-${chain.jobId}`,
    jobId: chain.jobId,
    agentId: agent.id,
    agentName: agent.name,
    category: agent.category,
    buyer: input.buyer ?? null,
    outcomeId: input.outcomeId,
    createdAt: new Date().toISOString(),
    status: chain.status,
    settlementNetwork: SETTLEMENT_NETWORK,
    settlementLabel: SETTLEMENT_NETWORK === "bsc-testnet" ? "BNB Smart Chain testnet" : "BNB Smart Chain",
    discoveryNetwork: agent.live.network,
    price: {
      raw: budgetRaw.toString(),
      display: chain.budgetDisplay,
      currency: agent.live.quote?.currency ?? "U",
      quotedByAgent: Boolean(agent.live.quote?.accepted || delivery.quotedByAgent),
    },
    provider: {
      quotedAddress: agent.live.quote?.provider ?? delivery.quotedProvider,
      escrowAddress: chain.provider,
    },
    delivery: {
      kind: delivery.kind,
      label: delivery.label,
      content: delivery.content,
      hash: deliverableHash,
    },
    chain,
    caveats,
  };

  void n;
  await saveReceipt(receipt);
  return receipt;
}

/** Try to release escrow; safe to call repeatedly. */
export async function trySettle(jobId: string): Promise<Receipt | null> {
  const receipt = await readReceipt(jobId);
  if (!receipt) return null;
  const res = await settlement.settle(BigInt(jobId));
  receipt.status = res.status;
  if (res.settled) {
    receipt.settledAt = receipt.settledAt ?? new Date().toISOString();
    // Only record the release once, however many times settle is polled.
    if (res.step && !receipt.chain.steps.some((s) => s.txHash === res.step!.txHash))
      receipt.chain.steps = [...receipt.chain.steps, res.step];
  } else if (res.reason) {
    receipt.chain.settleAvailableAt = receipt.chain.settleAvailableAt ?? null;
  }
  await saveReceipt(receipt);
  return receipt;
}

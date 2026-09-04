import { keccak256, toHex, type Hex } from "viem";
import { promises as fs } from "node:fs";
import path from "node:path";
import { liveAgent } from "@/lib/live/snapshot";
import { quote, callTool, notifyFunded } from "@/lib/live/agent-adapter";
import { settlementFor, escrowAddress, type OpenResult, type StepRecord } from "@/lib/settlement/erc8183";
import { rosterEntry } from "@/lib/live/roster";
import { NETWORKS, type NetworkName } from "@/lib/live/chain";

// A hire settles on the chain where the provider actually lives, naming that
// provider, so the seller can see the job and work for it.
//
// Two shapes, and only two:
//
//   paid   The agent quoted a price and a payout address. We escrow that exact
//          amount on that exact chain against that exact provider, tell the
//          seller, and wait for it to submit real work.
//   free   The agent exposes read-only tools and charges nothing. There is
//          nothing to escrow, so no job is created and the output is the result.
//
// A quote is never recorded as if it were finished work.

export type DeliveryKind = "agent-output" | "agent-delivered";

export interface Receipt {
  id: string;
  jobId: string | null;
  agentId: string;
  agentName: string;
  category: string;
  buyer: string | null;
  outcomeId?: string;
  createdAt: string;
  settledAt?: string;
  status: string;
  mode: "paid" | "free";
  settlementNetwork: NetworkName | null;
  settlementLabel: string;
  discoveryNetwork: string;
  price: { raw: string; display: string; currency: string; quotedByAgent: boolean };
  provider: { quotedAddress?: string; escrowAddress: string; onchainProvider?: string };
  delivery: { kind: DeliveryKind; label: string; content: string; hash: string };
  chain: OpenResult | null;
  caveats: string[];
}

const RECEIPTS = path.join(process.cwd(), "data", "receipts");

export async function saveReceipt(r: Receipt) {
  await fs.mkdir(RECEIPTS, { recursive: true });
  await fs.writeFile(path.join(RECEIPTS, `${r.id}.json`), JSON.stringify(r, null, 2), "utf8");
}

export async function readReceipt(id: string): Promise<Receipt | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(RECEIPTS, `${id}.json`), "utf8")) as Receipt;
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

const networkForChainId = (id?: number): NetworkName | null => {
  const hit = (Object.entries(NETWORKS) as [NetworkName, { chainId: number }][]).find(
    ([, n]) => n.chainId === id,
  );
  return hit?.[0] ?? null;
};

export interface HireInput {
  agentId: string;
  buyer?: string | null;
  outcomeId?: string;
  request?: string;
  params?: Record<string, unknown>;
}

/** A free read from an agent that exposes read-only tools. No escrow. */
async function hireFree(
  agent: NonNullable<Awaited<ReturnType<typeof liveAgent>>>,
  request: string,
  params: Record<string, unknown>,
  input: HireInput,
): Promise<Receipt> {
  const entry = rosterEntry(agent.live.agentId);
  const mcp = agent.live.routes.find((r) => r.kind === "MCP" && r.endpoint);
  if (!mcp || !entry?.evidenceTool)
    throw new Error(`${agent.name} does not expose a free tool and did not quote a price`);

  const out = await callTool(
    mcp,
    entry.evidenceTool,
    (params.toolArgs as Record<string, unknown>) ?? entry.evidenceArgs ?? {},
  );
  if (!out.ok || !out.text) throw new Error(`${agent.name} returned no output: ${out.text.slice(0, 160)}`);

  const content = out.text.slice(0, 20_000);
  const receipt: Receipt = {
    id: `free-${agent.live.agentId}-${Date.now()}`,
    jobId: null,
    agentId: agent.id,
    agentName: agent.name,
    category: agent.category,
    buyer: input.buyer ?? null,
    outcomeId: input.outcomeId,
    createdAt: new Date().toISOString(),
    settledAt: new Date().toISOString(),
    status: "DELIVERED",
    mode: "free",
    settlementNetwork: null,
    settlementLabel: "No payment required",
    discoveryNetwork: agent.live.network,
    price: { raw: "0", display: "No charge", currency: "U", quotedByAgent: false },
    provider: { escrowAddress: escrowAddress() },
    delivery: {
      kind: "agent-output",
      label: `Live output from ${agent.name}'s ${entry.evidenceTool} tool`,
      content,
      hash: keccak256(toHex(content)),
    },
    chain: null,
    caveats: [
      "This agent publishes read-only tools free of charge, so there is nothing to escrow and no onchain job was created.",
    ],
  };
  await saveReceipt(receipt);
  return receipt;
}

/** A paid hire: escrow on the provider's own chain, then wait for real work. */
async function hirePaid(
  agent: NonNullable<Awaited<ReturnType<typeof liveAgent>>>,
  request: string,
  input: HireInput,
): Promise<Receipt> {
  const q = agent.live.quote!;
  const network = networkForChainId(q.chainId) ?? (agent.live.network as NetworkName);
  const provider = q.provider!;
  const settlement = settlementFor(network);
  const budgetRaw = BigInt(q.priceRaw ?? "0");

  const description = JSON.stringify({
    schema: "mandate/hire/v1",
    agentId: agent.live.agentId,
    agentName: agent.name,
    category: agent.category,
    service: agent.live.serviceId,
    buyer: input.buyer ?? null,
    outcomeId: input.outcomeId ?? null,
    request,
  });

  // 1. Escrow against the agent's own payout address, on its own chain.
  const chain = await settlement.open({ provider, budgetRaw, description });

  // 2. Tell the seller. It reads the job from the same chain, sees itself named
  //    as provider, does the work, and submits.
  const route = agent.live.route!;
  const notice = await notifyFunded(route, chain.jobId, {
    request,
    chain_id: chain.chainId,
    ...(input.params ?? {}),
  });

  // 3. Wait for the deliverable to land on chain.
  const delivered = await settlement.awaitDelivery(BigInt(chain.jobId), 180_000);
  const finalChain = await settlement.describe(BigInt(chain.jobId), chain.steps);

  const caveats: string[] = [];
  let content: string;
  let label: string;

  if (delivered.delivered && notice.ok) {
    content = notice.text.slice(0, 20_000);
    label = `Work delivered by ${agent.name} against job #${chain.jobId}`;
  } else if (delivered.delivered) {
    content = `Deliverable recorded on chain: ${delivered.deliverable}\n\nThe agent submitted its work to the kernel but did not return the payload over A2A.`;
    label = `Deliverable recorded on chain for job #${chain.jobId}`;
  } else {
    content = notice.ok
      ? notice.text.slice(0, 20_000)
      : `The seller has not submitted yet.\n\nIts reply: ${notice.text.slice(0, 1200)}`;
    label = `Job #${chain.jobId} is funded and awaiting the agent's submission`;
    caveats.push(
      "Escrow is funded and the agent has been notified, but it had not submitted its deliverable when this receipt was written. Escrow stays locked until it does, and refunds to you if the job expires first.",
    );
  }

  if (finalChain.disputeWindowSeconds > 3600) {
    const days = Math.round(finalChain.disputeWindowSeconds / 86400);
    caveats.push(
      `This chain's dispute window is ${days} day${days === 1 ? "" : "s"}. The deliverable is yours now; escrow releases to the agent automatically after that window unless you dispute.`,
    );
  }

  const receipt: Receipt = {
    id: `job-${network}-${chain.jobId}`,
    jobId: chain.jobId,
    agentId: agent.id,
    agentName: agent.name,
    category: agent.category,
    buyer: input.buyer ?? null,
    outcomeId: input.outcomeId,
    createdAt: new Date().toISOString(),
    status: finalChain.status,
    mode: "paid",
    settlementNetwork: network,
    settlementLabel: network === "bsc-mainnet" ? "BNB Smart Chain" : "BNB Smart Chain testnet",
    discoveryNetwork: agent.live.network,
    price: {
      raw: budgetRaw.toString(),
      display: finalChain.budgetDisplay,
      currency: q.currency ?? "U",
      quotedByAgent: true,
    },
    provider: {
      quotedAddress: provider,
      escrowAddress: escrowAddress(),
      onchainProvider: finalChain.provider,
    },
    delivery: {
      kind: delivered.delivered ? "agent-delivered" : "agent-output",
      label,
      content,
      hash: keccak256(toHex(content)),
    },
    chain: finalChain,
    caveats,
  };
  await saveReceipt(receipt);
  return receipt;
}

export async function hire(input: HireInput): Promise<Receipt> {
  const agent = await liveAgent(input.agentId);
  if (!agent) throw new Error(`No live agent ${input.agentId}`);
  if (agent.status === "offline")
    throw new Error(`${agent.name} is not answering right now, so it cannot be hired`);

  const request =
    input.request ?? `${agent.category.replaceAll("-", " ")} for a position on BNB Smart Chain`;

  // Re-quote at hire time: a snapshot price is a listing, not a commitment.
  let q = agent.live.quote;
  if (agent.live.route) {
    try {
      const fresh = await quote(agent.live.route, request, agent.live.serviceId);
      if (fresh.accepted && fresh.priceRaw && fresh.provider) {
        q = {
          accepted: true,
          priceRaw: fresh.priceRaw,
          priceDisplay: fresh.priceDisplay,
          currency: fresh.currency,
          provider: fresh.provider,
          needs: fresh.needs,
          deliverables: fresh.deliverables,
          chainId: fresh.chainId,
          verifyingContract: fresh.verifyingContract,
          paymentToken: fresh.paymentToken,
          estimatedSeconds: fresh.estimatedSeconds,
        };
        agent.live.quote = q;
      }
    } catch {
      /* keep the snapshot quote */
    }
  }

  const priced = Boolean(q?.accepted && q.provider && BigInt(q.priceRaw ?? "0") > 0n);
  return priced ? hirePaid(agent, request, input) : hireFree(agent, request, input.params ?? {}, input);
}

/** Try to release escrow; safe to call repeatedly. */
export async function trySettle(id: string): Promise<Receipt | null> {
  const receipt = await readReceipt(id);
  if (!receipt || !receipt.jobId || !receipt.settlementNetwork) return receipt;
  const settlement = settlementFor(receipt.settlementNetwork);
  const res = await settlement.settle(BigInt(receipt.jobId));
  receipt.status = res.status;
  if (res.settled) {
    receipt.settledAt = receipt.settledAt ?? new Date().toISOString();
    const step: StepRecord | undefined = res.step;
    if (step && !receipt.chain?.steps.some((s) => s.txHash === step.txHash) && receipt.chain)
      receipt.chain.steps = [...receipt.chain.steps, step];
  }
  await saveReceipt(receipt);
  return receipt;
}

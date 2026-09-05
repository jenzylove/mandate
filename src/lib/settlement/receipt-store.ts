import { promises as fs } from "node:fs";
import path from "node:path";
import type { Receipt } from "@/lib/settlement/hire";
import { settlementFor, escrowAddress } from "@/lib/settlement/erc8183";
import { publicClientFor, net, commerceAbi, type NetworkName } from "@/lib/live/chain";

// Receipts are written to the filesystem, which on a serverless host is
// per-instance and does not survive a redeploy. That is fine as a cache and
// useless as a system of record, so the store is only half the story.
//
// The durable half is the chain. A paid hire's job description carries the
// agent, the buyer and the request, and the kernel carries the status, budget,
// provider and deliverable digest. Any paid receipt can therefore be rebuilt
// from chain by anyone, on any instance, forever.
//
// What cannot be rebuilt is the deliverable payload: only its digest is on
// chain. A reconstructed receipt says so rather than pretending otherwise.

const DIR = path.join(process.cwd(), "data", "receipts");

export async function writeToStore(r: Receipt): Promise<void> {
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${r.id}.json`), JSON.stringify(r, null, 2), "utf8");
  } catch {
    // A read-only filesystem is expected in production. The chain still holds
    // everything that matters for a paid hire.
  }
}

export async function readFromStore(id: string): Promise<Receipt | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, `${id}.json`), "utf8")) as Receipt;
  } catch {
    return null;
  }
}

export async function listFromStore(): Promise<Receipt[]> {
  try {
    const files = await fs.readdir(DIR);
    return await Promise.all(
      files
        .filter((f) => f.endsWith(".json"))
        .map(async (f) => JSON.parse(await fs.readFile(path.join(DIR, f), "utf8")) as Receipt),
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- chain ----

interface JobDescription {
  schema?: string;
  agentId?: string;
  agentName?: string;
  category?: string;
  service?: string;
  buyer?: string | null;
  outcomeId?: string | null;
  request?: string;
}

const parseDescription = (raw: string): JobDescription | null => {
  try {
    const d = JSON.parse(raw) as JobDescription;
    return d.schema === "mandate/hire/v1" ? d : null;
  } catch {
    return null;
  }
};

/** Rebuild a paid receipt from the chain alone. */
export async function reconstructFromChain(network: NetworkName, jobId: string): Promise<Receipt | null> {
  const settlement = settlementFor(network);
  let state: Awaited<ReturnType<typeof settlement.jobState>>;
  try {
    state = await settlement.jobState(BigInt(jobId));
  } catch {
    return null;
  }
  const desc = parseDescription(state.description);
  if (!desc) return null; // not one of ours

  const chain = await settlement.describe(BigInt(jobId), []);
  const n = net(network);

  return {
    id: `job-${network}-${jobId}`,
    jobId,
    agentId: desc.agentId ? `live-${desc.agentId}` : "unknown",
    agentName: desc.agentName ?? `Agent #${desc.agentId ?? "?"}`,
    category: desc.category ?? "unknown",
    buyer: desc.buyer ?? null,
    outcomeId: desc.outcomeId ?? undefined,
    createdAt: new Date(0).toISOString(),
    status: chain.status,
    mode: "paid",
    settlementNetwork: network,
    settlementLabel: network === "bsc-mainnet" ? "BNB Smart Chain" : "BNB Smart Chain testnet",
    discoveryNetwork: "bsc-mainnet",
    price: {
      raw: chain.budgetRaw,
      display: chain.budgetDisplay,
      currency: "U",
      quotedByAgent: true,
    },
    provider: {
      escrowAddress: escrowAddress(),
      onchainProvider: chain.provider,
      quotedAddress: chain.provider,
    },
    delivery: {
      kind: "agent-delivered",
      label: `Rebuilt from ${n.explorer.replace("https://", "")} for job #${jobId}`,
      content:
        `Deliverable digest recorded on chain:\n${state.deliverable}\n\n` +
        `Request: ${desc.request ?? "not recorded"}\n\n` +
        `This receipt was rebuilt from the chain because the server no longer holds ` +
        `the delivered payload. The digest above is what the agent committed to, and ` +
        `it is permanent. The payload itself was not retained.`,
      hash: state.deliverable,
    },
    chain,
    caveats: [
      "Rebuilt from onchain state. The job, its status, its price and the deliverable digest are permanent; the delivered payload was not retained by the server.",
    ],
  };
}

/**
 * Every paid job this marketplace has opened, read from the kernel's own logs.
 * Independent of any server storage.
 */
const chainListCache = new Map<NetworkName, { at: number; rows: Receipt[] }>();
const CHAIN_LIST_TTL_MS = 60_000;

export async function listFromChain(network: NetworkName, buyer?: string): Promise<Receipt[]> {
  const cached = chainListCache.get(network);
  if (cached && Date.now() - cached.at < CHAIN_LIST_TTL_MS) {
    return buyer
      ? cached.rows.filter((r) => r.buyer?.toLowerCase() === buyer.toLowerCase())
      : cached.rows;
  }
  return listFromChainUncached(network, buyer);
}

async function listFromChainUncached(network: NetworkName, buyer?: string): Promise<Receipt[]> {
  const client = publicClientFor(network);
  const n = net(network);
  const escrow = escrowAddress();

  try {
    const latest = await client.getBlockNumber();
    // Three days of blocks at ~3s: far enough back for a hackathon, cheap
    // enough not to hammer a public RPC.
    const span = 86_400n;
    const logs = await client.getContractEvents({
      address: n.commerce,
      abi: commerceAbi,
      eventName: "JobCreated",
      args: { client: escrow as `0x${string}` },
      fromBlock: latest > span ? latest - span : 0n,
      toBlock: latest,
    });

    const ids = [...new Set(logs.map((l) => String((l.args as { jobId?: bigint }).jobId ?? "")))].filter(Boolean);
    const rows = await Promise.all(ids.map((id) => reconstructFromChain(network, id).catch(() => null)));
    const found = rows.filter((r): r is Receipt => r !== null);
    chainListCache.set(network, { at: Date.now(), rows: found });
    return buyer ? found.filter((r) => r.buyer?.toLowerCase() === buyer.toLowerCase()) : found;
  } catch {
    return [];
  }
}

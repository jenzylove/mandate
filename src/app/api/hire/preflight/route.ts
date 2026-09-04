import { NextResponse } from "next/server";
import { liveAgent } from "@/lib/live/snapshot";
import { settlementFor, escrowAddress } from "@/lib/settlement/erc8183";
import { NETWORKS, type NetworkName } from "@/lib/live/chain";
import { rosterEntry } from "@/lib/live/roster";

export const dynamic = "force-dynamic";

const networkForChainId = (id?: number): NetworkName | null => {
  const hit = (Object.entries(NETWORKS) as [NetworkName, { chainId: number }][]).find(
    ([, n]) => n.chainId === id,
  );
  return hit?.[0] ?? null;
};

// Can this agent actually be hired right now? Answered before the button is
// shown, so a call to action never opens something that cannot complete.
export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });

  const agent = await liveAgent(agentId);
  if (!agent) return NextResponse.json({ ok: false, error: "not a live agent" }, { status: 404 });

  if (agent.status === "offline") {
    return NextResponse.json({
      ok: true,
      canHire: false,
      mode: "paid",
      reason: `${agent.name} is not answering right now.`,
    });
  }

  const q = agent.live.quote;
  const priced = Boolean(q?.accepted && q.provider && BigInt(q.priceRaw ?? "0") > 0n);

  if (!priced) {
    // No price means the only way to get work is a free read-only tool. An
    // agent with neither is discoverable but not hireable, and must say so.
    const entry = rosterEntry(agent.live.agentId);
    // A card that lists skills is a claim; only a live JSON-RPC endpoint that
    // answered under its own skill name is something we can actually call.
    const a2aEndpoint = agent.live.route?.kind === "A2A" ? agent.live.route.endpoint : null;
    const servesDirectSkill =
      Boolean(a2aEndpoint) &&
      !a2aEndpoint!.endsWith(".json") &&
      (agent.live.probe.skills?.length ?? 0) > 0;
    const hasFreeTool =
      (Boolean(entry?.evidenceTool) && agent.live.routes.some((r) => r.kind === "MCP" && r.endpoint)) ||
      servesDirectSkill;
    return NextResponse.json({
      ok: true,
      canHire: hasFreeTool,
      mode: "free",
      price: hasFreeTool ? "No charge" : undefined,
      reason: hasFreeTool
        ? "This agent publishes read-only tools free of charge."
        : `${agent.name} did not quote a price and exposes no free tool we can call. Its endpoint may require credentials the marketplace does not hold.`,
    });
  }

  const network = networkForChainId(q!.chainId) ?? (agent.live.network as NetworkName);
  try {
    const settlement = settlementFor(network);
    const [balance, window] = await Promise.all([
      settlement.escrowBalance(),
      settlement.disputeWindow(),
    ]);
    const needed = BigInt(q!.priceRaw!);
    const have = BigInt(balance.raw);
    return NextResponse.json({
      ok: true,
      canHire: have >= needed,
      mode: "paid",
      network,
      networkLabel: network === "bsc-mainnet" ? "BNB Smart Chain" : "BNB Smart Chain testnet",
      price: q!.priceDisplay ?? `${Number(needed) / 1e18} ${balance.symbol}`,
      provider: q!.provider,
      disputeWindowSeconds: window,
      escrow: { address: escrowAddress(), balance: balance.display },
      reason:
        have >= needed
          ? `Escrow will be funded on ${network} against the agent's own payout address.`
          : `Mandate's escrow account holds ${balance.display} on ${network} and this job costs ${q!.priceDisplay}. Hiring is paused until it is funded.`,
    });
  } catch (e) {
    return NextResponse.json({
      ok: true,
      canHire: false,
      mode: "paid",
      reason: `Settlement is unavailable: ${(e as Error).message}`,
    });
  }
}

import { NextResponse } from "next/server";
import type { HireContext } from "@/lib/domain/types";
import {
  negotiateHire,
  type NegotiationResult,
} from "@/lib/commerce/negotiate";
import { settlementFor, escrowAddress } from "@/lib/settlement/erc8183";

export const dynamic = "force-dynamic";

function quoteView(result: NegotiationResult) {
  const q = result.quote;
  if (!q) return undefined;
  return {
    accepted: q.accepted,
    provider: result.provider ?? q.provider,
    priceRaw: q.priceRaw,
    priceDisplay: q.priceDisplay,
    currency: q.currency,
    service: q.service,
    deliverables: q.deliverables,
    needs: q.needs,
    chainId: q.chainId,
    verifyingContract: q.verifyingContract,
    paymentToken: q.paymentToken,
    estimatedSeconds: q.estimatedSeconds,
    expiresAt: q.expiresAt,
    negotiationHash: q.negotiationHash,
    responseHash: q.responseHash,
    providerSig: q.providerSig,
  };
}

function baseResponse(result: NegotiationResult) {
  return {
    ok: true,
    agentId: result.agent?.id,
    agentName: result.agent?.name,
    status: result.status,
    canHire: false,
    mode: result.mode ?? "paid",
    provider: result.provider,
    network: result.network,
    missingFields: result.missingFields,
    quote: quoteView(result),
    checkedAt: result.checkedAt,
    reason: result.reason ?? "The selected agent did not return executable terms.",
  };
}

async function run(agentId: string, context: HireContext) {
  const result = await negotiateHire(agentId, context);
  const response = baseResponse(result);
  if (result.status !== "ready") return response;
  if (result.mode === "free") {
    return {
      ...response,
      canHire: true,
      mode: "free" as const,
      price: "No charge",
      reason: "The agent returned a callable free result.",
    };
  }
  if (!result.network || !result.quote?.priceRaw || !result.provider)
    return { ...response, status: "unavailable" as const, reason: "The live quote is incomplete." };

  try {
    const settlement = result.rail?.settlement ?? settlementFor(result.network);
    const [balance, window] = await Promise.all([
      settlement.escrowBalance(),
      settlement.disputeWindow(),
    ]);
    const needed = BigInt(result.quote.priceRaw);
    const have = BigInt(balance.raw);
    return {
      ...response,
      canHire: have >= needed,
      mode: "paid" as const,
      networkLabel: result.network === "bsc-mainnet" ? "BNB Smart Chain" : "BNB Smart Chain testnet",
      price: result.quote.priceDisplay ?? `${Number(needed) / 10 ** balance.decimals} ${balance.symbol}`,
      disputeWindowSeconds: window,
      escrow: { address: escrowAddress(), balance: balance.display },
      reason:
        have >= needed
          ? "Mandate received a fresh quote and can escrow it against the agent's payout address."
          : `Mandate's escrow account holds ${balance.display} on ${result.network} and this job costs ${result.quote.priceDisplay ?? "the quoted amount"}.`,
    };
  } catch (error) {
    return {
      ...response,
      status: "unavailable" as const,
      reason: `Settlement is unavailable after live negotiation: ${(error as Error).message}`,
    };
  }
}

function fromQuery(req: Request): HireContext & { agentId?: string } {
  const params = new URL(req.url).searchParams;
  const context: HireContext & { agentId?: string } = { agentId: params.get("agentId") ?? undefined };
  for (const key of ["buyer", "request", "outcomeId", "asset", "quoteAsset", "pair", "protocol", "amount", "risk", "control"]) {
    const value = params.get(key);
    if (value) context[key] = value;
  }
  return context;
}

export async function GET(req: Request) {
  const context = fromQuery(req);
  if (!context.agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
  const { agentId, ...negotiationContext } = context;
  return NextResponse.json(await run(agentId!, negotiationContext));
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    agentId?: string;
    buyer?: string | null;
    request?: string;
    outcomeId?: string;
    context?: HireContext;
    params?: Record<string, unknown>;
    candidateAgentIds?: string[];
  };
  if (!body.agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
  const context: HireContext = {
    ...(body.context ?? {}),
    ...(body.params ?? {}),
    agentId: body.agentId,
    buyer: body.buyer ?? body.context?.buyer ?? null,
    request: body.request ?? body.context?.request,
    outcomeId: body.outcomeId ?? body.context?.outcomeId,
  };
  const { agentId: _agentId, ...negotiationContext } = context;
  const candidates = [body.agentId, ...(body.candidateAgentIds ?? [])]
    .filter((id): id is string => Boolean(id))
    .filter((id, index, ids) => ids.indexOf(id) === index)
    .slice(0, 6);
  let last = await run(candidates[0]!, negotiationContext);
  for (const candidate of candidates.slice(1)) {
    if (last.status !== "unavailable" && last.status !== "settlement-incompatible") break;
    last = await run(candidate, negotiationContext);
  }
  return NextResponse.json(last);
}

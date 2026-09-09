import { readSnapshot } from "@/lib/live/snapshot";
import { negotiateHire, type NegotiationResult } from "@/lib/commerce/negotiate";
import { REQUIRED_CATEGORIES } from "@/lib/domain/types";
import { net } from "@/lib/live/chain";

// Read-only commerce audit. It samples current snapshot supply and calls each
// selected provider live; it never opens escrow, funds a job, or broadcasts.

const sample = async () => {
  const snapshot = await readSnapshot();
  if (!snapshot) throw new Error("no committed marketplace snapshot");
  const picked = REQUIRED_CATEGORIES.flatMap((category) =>
    snapshot.agents.filter((agent) => agent.category === category).slice(0, 2),
  );
  picked.push(...snapshot.agents.filter((agent) => {
    const q = agent.live.quote;
    if (!q?.accepted || !q.priceRaw) return false;
    try { return BigInt(q.priceRaw) > 0n; } catch { return false; }
  }));
  const ivl = snapshot.agents.find((agent) => agent.live.agentId === "341628");
  if (ivl && !picked.some((agent) => agent.id === ivl.id)) picked.push(ivl);
  return { snapshot, agents: picked.filter((agent, index, all) => all.findIndex((a) => a.id === agent.id) === index) };
};

function isPaidQuote(result: NegotiationResult): boolean {
  if (!result.quote?.accepted || !result.quote.priceRaw) return false;
  try {
    return BigInt(result.quote.priceRaw) > 0n;
  } catch {
    return false;
  }
}

function countReasons(results: NegotiationResult[]) {
  return results.reduce((counts, result) => {
    if (result.reason?.startsWith("Live negotiation failed:")) counts.adapterFailure++;
    else if (result.status === "settlement-incompatible" || result.reason?.includes("payment token") || result.reason?.includes("verifying contract")) counts.settlementFailure++;
    else if (result.status === "unavailable") counts.providerFailure++;
    return counts;
  }, { adapterFailure: 0, providerFailure: 0, settlementFailure: 0 });
}

function quotedToken(result: NegotiationResult): string | undefined {
  const value = result.quote?.paymentToken ?? result.quote?.currency;
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) ? value : undefined;
}

function isCurrentMandateRail(result: NegotiationResult): boolean {
  const network = result.network ?? "bsc-mainnet";
  const q = result.quote;
  const token = quotedToken(result);
  const verifier = q?.verifyingContract;
  return (!token || token.toLowerCase() === net(network).paymentToken.toLowerCase()) &&
    (!verifier || verifier.toLowerCase() === net(network).commerce.toLowerCase());
}

async function main() {
  const { snapshot, agents } = await sample();
  const before = agents.reduce((counts, agent) => {
    const q = agent.live.quote;
    if (q?.accepted) counts.accepted++;
    if (q?.accepted && q.priceRaw && BigInt(q.priceRaw) > 0n) counts.paid++;
    if (q?.accepted && q.priceRaw === "0") counts.free++;
    return counts;
  }, { accepted: 0, paid: 0, free: 0 });

  const results = await Promise.all(agents.map((agent) => negotiateHire(agent.id, {
    request: agent.description,
  })));
  const preferenceResults = await Promise.all(results.map((result, index) => {
    if (!isPaidQuote(result)) return null;
    return negotiateHire(agents[index].id, {
      request: agents[index].description,
      settlementPreferences: {
        chainId: net("bsc-mainnet").chainId,
        verifyingContract: net("bsc-mainnet").commerce,
        paymentToken: net("bsc-mainnet").paymentToken,
      },
    }, { checkSettlement: false });
  }));
  const paidResults = results.filter(isPaidQuote);
  const paidPreferenceResults = preferenceResults.filter((result): result is NegotiationResult => Boolean(result));
  const after = {
    readyPaid: results.filter((result) => result.status === "ready" && result.mode === "paid").length,
    readyFree: results.filter((result) => result.status === "ready" && result.mode === "free").length,
    needsInput: results.filter((result) => result.status === "needs-input").length,
    unavailable: results.filter((result) => result.status === "unavailable").length,
    acceptedQuotes: results.filter((result) => result.quote?.accepted).length,
    freeCallable: results.filter((result) => result.mode === "free" && result.quote?.deliverables).length,
    ...countReasons(results),
  };
  const compatibility = {
    paidSample: paidResults.length,
    quotedMandateExistingRail: paidResults.filter(isCurrentMandateRail).length,
    quotedAnotherLegitimateErc8183Rail: paidResults.filter((result) => {
      const token = quotedToken(result);
      return Boolean(token && !isCurrentMandateRail(result) && result.status === "ready");
    }).length,
    renegotiableToMandateRail: paidPreferenceResults.filter(isCurrentMandateRail).length,
    genuinelySettlementIncompatible: paidResults.filter((result) => result.status === "settlement-incompatible").length,
  };

  console.log(JSON.stringify({
    snapshot: { refreshedAt: snapshot.refreshedAt, agents: snapshot.agents.length },
    sample: agents.map((agent) => ({ id: agent.id, name: agent.name, category: agent.category })),
    beforeCachedSnapshot: before,
    afterLiveNegotiation: after,
    compatibility,
    ivl: (() => {
      const index = agents.findIndex((agent) => agent.live.agentId === "341628");
      if (index < 0) return { included: false };
      const result = results[index];
      return {
        included: true,
        status: result.status,
        mode: result.mode,
        reason: result.reason,
        provider: result.provider,
        network: result.network,
        quote: result.quote && {
          accepted: result.quote.accepted,
          priceRaw: result.quote.priceRaw,
          currency: result.quote.currency,
          paymentToken: result.quote.paymentToken,
          chainId: result.quote.chainId,
          verifyingContract: result.quote.verifyingContract,
          negotiationHash: result.quote.negotiationHash,
          responseHash: result.quote.responseHash,
          providerSig: result.quote.providerSig,
          expiresAt: result.quote.expiresAt,
          raw: result.quote.raw,
        },
      };
    })(),
    results: results.map((result, index) => ({
      id: agents[index].id,
      status: result.status,
      mode: result.mode,
      missingFields: result.missingFields,
      reason: result.reason,
      quoted: Boolean(result.quote?.accepted),
      paid: isPaidQuote(result),
    })),
    noTransactions: true,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

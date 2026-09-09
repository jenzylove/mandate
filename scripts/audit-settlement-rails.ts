import { keccak256, toBytes } from "viem";
import { negotiateHire } from "@/lib/commerce/negotiate";
import { readSnapshot } from "@/lib/live/snapshot";
import {
  commerceAbi,
  net,
  policyAbi,
  publicClientFor,
  routerAbi,
} from "@/lib/live/chain";
import { matchSettlementTerms, verifiedSettlementRail } from "@/lib/settlement/rails";

// Read-only investigation of the IVL commerce quote and its BSC settlement
// rail. No wallet client, approve, createJob, fund, or other write is used.
const IVL = "live-341628";
const bsc = "bsc-mainnet" as const;
const existing = net(bsc);
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const ivlContext = {
  buyer: "0x1111111111111111111111111111111111111111",
  pair: "BNB/USDT",
  asset: "USDT",
  quoteAsset: "BNB",
  protocol: "PancakeSwap v3",
  request: "Return a live IVL rebalance decision and target ticks for BNB/USDT.",
  requestedDeliverable: "Live IVL rebalance decision and target ticks",
};

function selector(signature: string) {
  return keccak256(toBytes(signature)).slice(0, 10).toLowerCase();
}

async function main() {
  const snapshot = await readSnapshot();
  const selected = snapshot?.agents.find((agent) => agent.id === IVL);
  if (!selected) throw new Error(`missing ${IVL} from the committed snapshot`);

  const normal = await negotiateHire(IVL, ivlContext, { checkSettlement: false });
  const requestedRail = await negotiateHire(IVL, {
    ...ivlContext,
    settlementPreferences: {
      chainId: existing.chainId,
      verifyingContract: existing.commerce,
      paymentToken: existing.paymentToken,
    },
  }, { checkSettlement: false });
  const q = normal.quote;
  const preferredQ = requestedRail.quote;
  if (!q || !preferredQ) throw new Error("IVL did not return a quote for both read-only probes");

  const client = publicClientFor(bsc);
  const quotedContract = q.verifyingContract ?? existing.commerce;
  const bytecode = quotedContract === existing.commerce
    ? await client.getBytecode({ address: quotedContract as `0x${string}` })
    : undefined;
  const implementationSlot = quotedContract === existing.commerce
    ? await client.getStorageAt({ address: quotedContract as `0x${string}`, slot: EIP1967_IMPLEMENTATION_SLOT })
    : undefined;
  const implementation = implementationSlot && implementationSlot !== "0x"
    ? `0x${implementationSlot.slice(-40)}`
    : undefined;
  const implementationCode = implementation
    ? await client.getBytecode({ address: implementation as `0x${string}` })
    : undefined;
  const lifecycle = {
    paymentToken: selector("paymentToken()"),
    jobCounter: selector("jobCounter()"),
    createJob: selector("createJob(address,address,uint256,string,address)"),
    setBudget: selector("setBudget(uint256,uint256,bytes)"),
    fund: selector("fund(uint256,uint256,bytes)"),
    submit: selector("submit(uint256,bytes32,bytes)"),
    claimRefund: selector("claimRefund(uint256)"),
  };
  const code = (implementationCode ?? bytecode)?.toLowerCase() ?? "";
  const selectorPresence = Object.fromEntries(
    Object.entries(lifecycle).map(([name, value]) => [name, code.includes(value.slice(2))]),
  );

  const [paymentToken, jobCounter, platformFeeBP, rail, disputeWindow] = await Promise.all([
    client.readContract({ address: quotedContract as `0x${string}`, abi: commerceAbi, functionName: "paymentToken" }),
    client.readContract({ address: quotedContract as `0x${string}`, abi: commerceAbi, functionName: "jobCounter" }),
    client.readContract({ address: quotedContract as `0x${string}`, abi: commerceAbi, functionName: "platformFeeBP" }),
    verifiedSettlementRail(bsc),
    client.readContract({ address: existing.policy, abi: policyAbi, functionName: "disputeWindow" }),
  ]);

  let latestJob: unknown = null;
  let latestPolicy: unknown = null;
  if (jobCounter > 0n) {
    const jobId = jobCounter - 1n;
    latestJob = await client.readContract({ address: quotedContract as `0x${string}`, abi: commerceAbi, functionName: "jobs", args: [jobId] });
    latestPolicy = await client.readContract({ address: existing.router, abi: routerAbi, functionName: "jobPolicy", args: [jobId] }).catch(() => null);
  }

  const requested = {
    accepted: preferredQ.accepted,
    priceRaw: preferredQ.priceRaw,
    currency: preferredQ.currency,
    paymentToken: preferredQ.paymentToken,
    chainId: preferredQ.chainId,
    verifyingContract: preferredQ.verifyingContract,
    negotiationHash: preferredQ.negotiationHash,
    responseHash: preferredQ.responseHash,
    providerSig: preferredQ.providerSig,
    expiresAt: preferredQ.expiresAt,
  };

  const output = {
    noTransactions: true,
    ivl: {
      agentId: selected.id,
      name: selected.name,
      provider: normal.provider ?? q.provider,
      quote: {
        accepted: q.accepted,
        priceRaw: q.priceRaw,
        priceDisplay: q.priceDisplay,
        currency: q.currency,
        paymentToken: q.paymentToken,
        chainId: q.chainId,
        verifyingContract: q.verifyingContract,
        negotiationHash: q.negotiationHash,
        responseHash: q.responseHash,
        providerSig: q.providerSig,
        expiresAt: q.expiresAt,
        raw: q.raw,
      },
      alternateRailRequest: {
        sent: {
          chainId: existing.chainId,
          verifyingContract: existing.commerce,
          paymentToken: existing.paymentToken,
        },
        response: requested,
        honored: preferredQ.paymentToken?.toLowerCase() === existing.paymentToken.toLowerCase(),
      },
    },
    quotedContractAudit: {
      address: quotedContract,
      sameAsMandateAllowlist: quotedContract.toLowerCase() === existing.commerce.toLowerCase(),
      bytecodeExists: Boolean(bytecode && bytecode !== "0x"),
      implementation,
      implementationBytecodeExists: Boolean(implementationCode && implementationCode !== "0x"),
      selectorPresence,
      paymentTokenRead: paymentToken,
      paymentTokenMatchesConfiguredRail: paymentToken.toLowerCase() === existing.paymentToken.toLowerCase(),
      jobCounter: jobCounter.toString(),
      platformFeeBP: platformFeeBP.toString(),
      latestJob,
      routerPolicyForLatestJob: latestPolicy,
      disputeWindowSeconds: disputeWindow.toString(),
      quoteBindsToContract: q.verifyingContract?.toLowerCase() === quotedContract.toLowerCase(),
      evaluatorAndHookSemantics: {
        createJob: "Mandate's Erc8183Settlement.open names the allowlisted router as evaluator and hook.",
        policy: `Mandate registers each job with policy ${existing.policy} through router ${existing.router}.`,
        providerSubmission: "Provider submits its deliverable through the ERC-8183 commerce lifecycle; Mandate settles through the router after policy review.",
      },
      safeToFundIVLQuote: matchSettlementTerms({
        chainId: q.chainId,
        verifyingContract: q.verifyingContract,
        paymentToken: q.paymentToken ?? q.currency,
      }, rail).compatible,
    },
  };
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

import { keccak256, toBytes } from "viem";
import {
  commerceAbi,
  net,
  NETWORKS,
  publicClientFor,
  type NetworkName,
} from "@/lib/live/chain";
import { settlementFor, type Erc8183Settlement } from "@/lib/settlement/erc8183";

/** Provider terms that can influence where a paid job must be settled. */
export interface SettlementTerms {
  chainId?: number;
  verifyingContract?: string;
  paymentToken?: string;
}

/** The only rail Mandate is currently willing to execute on each network. */
export interface VerifiedSettlementRail {
  network: NetworkName;
  chainId: number;
  verifyingContract: string;
  paymentToken: string;
  router: string;
  policy: string;
  settlement: Erc8183Settlement;
  verified: {
    bytecode: boolean;
    paymentTokenFunction: boolean;
    lifecycleFunctions: boolean;
    implementation?: string;
    checkedAt: string;
  };
}

export interface SettlementRailIdentity {
  network: NetworkName;
  chainId: number;
  verifyingContract: string;
  paymentToken: string;
}

const isAddress = (value: unknown): value is string =>
  typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value) && BigInt(value) !== 0n;

const networkForChainId = (id?: number): NetworkName | null => {
  const hit = (Object.entries(NETWORKS) as [NetworkName, { chainId: number }][]).find(
    ([, n]) => n.chainId === id,
  );
  return hit?.[0] ?? null;
};

/**
 * Pure terms-to-allowlist check. This deliberately permits omitted fields:
 * older sellers quote Mandate's abstract `U` currency without repeating the
 * already-selected verifier/token. Omitted terms are filled only from the
 * verified rail for the quote's chain; a contradictory address is rejected.
 */
export function matchSettlementTerms(
  terms: SettlementTerms,
  rail: SettlementRailIdentity,
): { compatible: true } | { compatible: false; reason: string } {
  if (terms.chainId !== undefined && terms.chainId !== rail.chainId)
    return { compatible: false, reason: `agent quoted chain ${terms.chainId}, but the selected rail is chain ${rail.chainId}` };
  if (terms.verifyingContract && terms.verifyingContract.toLowerCase() !== rail.verifyingContract.toLowerCase())
    return {
      compatible: false,
      reason: `agent quoted verifying contract ${terms.verifyingContract}, but Mandate only executes ${rail.verifyingContract}`,
    };
  if (terms.paymentToken && terms.paymentToken.toLowerCase() !== rail.paymentToken.toLowerCase())
    return {
      compatible: false,
      reason: `agent quoted payment token ${terms.paymentToken}, but the verified ERC-8183 rail accepts ${rail.paymentToken}`,
    };
  return { compatible: true };
}

const verifiedCache = new Map<NetworkName, Promise<VerifiedSettlementRail>>();
const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const LIFECYCLE_SIGNATURES = [
  "createJob(address,address,uint256,string,address)",
  "setBudget(uint256,uint256,bytes)",
  "fund(uint256,uint256,bytes)",
  "submit(uint256,bytes32,bytes)",
  "claimRefund(uint256)",
  "jobs(uint256)",
] as const;

function selector(signature: string) {
  return keccak256(toBytes(signature)).slice(2, 10).toLowerCase();
}

/**
 * Verify the configured commerce rail before it is used for provider terms.
 * This is read-only. The allowlist is the committed NETWORKS registry; an
 * agent-provided contract can never become executable merely by appearing in
 * a quote.
 */
export async function verifiedSettlementRail(network: NetworkName): Promise<VerifiedSettlementRail> {
  const cached = verifiedCache.get(network);
  if (cached) return cached;

  const pending = (async () => {
    const n = net(network);
    if (!isAddress(n.commerce)) throw new Error(`allowlisted commerce address is invalid for ${network}`);
    const client = publicClientFor(network);
    const bytecode = await client.getBytecode({ address: n.commerce });
    if (!bytecode || bytecode === "0x") throw new Error(`allowlisted commerce contract has no bytecode on chain ${n.chainId}`);

    // The deployed rail is an EIP-1967 proxy. Inspect its implementation for
    // the lifecycle selectors as well as reading the proxy's live state.
    const implementationSlot = await client.getStorageAt({ address: n.commerce, slot: EIP1967_IMPLEMENTATION_SLOT });
    const implementation = implementationSlot && implementationSlot !== "0x"
      ? `0x${implementationSlot.slice(-40)}`
      : undefined;
    const implementationCode = implementation && isAddress(implementation)
      ? await client.getBytecode({ address: implementation as `0x${string}` })
      : undefined;
    const lifecycleCode = (implementationCode ?? bytecode).toLowerCase();
    const lifecycleFunctions = LIFECYCLE_SIGNATURES.every((signature) => lifecycleCode.includes(selector(signature)));
    if (!lifecycleFunctions) throw new Error("allowlisted commerce contract does not expose the required ERC-8183 lifecycle");

    const [onchainToken, jobCounter, platformFee] = await Promise.all([
      client.readContract({ address: n.commerce, abi: commerceAbi, functionName: "paymentToken" }),
      client.readContract({ address: n.commerce, abi: commerceAbi, functionName: "jobCounter" }),
      client.readContract({ address: n.commerce, abi: commerceAbi, functionName: "platformFeeBP" }),
    ]);
    void jobCounter;
    void platformFee;
    if (onchainToken.toLowerCase() !== n.paymentToken.toLowerCase())
      throw new Error(`allowlisted rail token drifted: config ${n.paymentToken}, chain ${onchainToken}`);

    return {
      network,
      chainId: n.chainId,
      verifyingContract: n.commerce,
      paymentToken: onchainToken,
      router: n.router,
      policy: n.policy,
      settlement: settlementFor(network),
      verified: {
        bytecode: true,
        paymentTokenFunction: true,
        // paymentToken, jobCounter and platformFeeBP all decoded through the
        // committed AgenticCommerce ABI. Mutating lifecycle functions remain
        // gated by the allowlisted address and are never probed with writes.
        lifecycleFunctions,
        implementation,
        checkedAt: new Date().toISOString(),
      },
    } satisfies VerifiedSettlementRail;
  })();

  verifiedCache.set(network, pending);
  try {
    return await pending;
  } catch (error) {
    verifiedCache.delete(network);
    throw error;
  }
}

/**
 * Resolve a provider quote to an executable, verified rail. A quote may omit
 * verifier/token when it uses Mandate's abstract legacy `U` terms, but any
 * explicit contract or token must match the verified allowlist and live chain.
 */
export async function settlementForTerms(
  terms: SettlementTerms,
  fallbackNetwork?: NetworkName,
): Promise<VerifiedSettlementRail> {
  const network = networkForChainId(terms.chainId) ?? fallbackNetwork;
  if (!network) throw new Error(`provider quote did not identify a supported settlement chain`);
  const rail = await verifiedSettlementRail(network);
  const match = matchSettlementTerms({ ...terms, chainId: terms.chainId ?? rail.chainId }, rail);
  if (!match.compatible) throw new Error(match.reason);
  return rail;
}

export function clearVerifiedSettlementRailCache() {
  verifiedCache.clear();
}

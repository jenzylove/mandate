import { createPublicClient, http, parseAbi } from "viem";
import { bsc, bscTestnet } from "viem/chains";

// Addresses come from bnb-chain/bnbagent-sdk's own network registry and were
// each confirmed by a live read. The Binance dataseed RPCs are unreachable from
// some networks, so publicnode leads.
export const NETWORKS = {
  "bsc-mainnet": {
    chainId: 56,
    chain: bsc,
    rpc: "https://bsc-rpc.publicnode.com",
    registry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432" as const,
    commerce: "0xea4daa3100a767e86fded867729ae7446476eba6" as const,
    router: "0x51895229e12f9876011789b04f8698af06ccd6da" as const,
    policy: "0x9c01845705b3078aa2e8cff7520a6376fd766de5" as const,
    paymentToken: "0xcE24439F2D9C6a2289F741120FE202248B666666" as const,
    explorer: "https://bscscan.com",
    paymaster: null as string | null,
  },
  "bsc-testnet": {
    chainId: 97,
    chain: bscTestnet,
    rpc: "https://bsc-testnet-rpc.publicnode.com",
    registry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const,
    commerce: "0xa206c0517b6371c6638cd9e4a42cc9f02a33b0de" as const,
    router: "0xd7d36d66d2f1b608a0f943f722d27e3744f66f25" as const,
    policy: "0xd6a4217588f6b1f5657a92a3e94e6422ad771cea" as const,
    paymentToken: "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565" as const,
    explorer: "https://testnet.bscscan.com",
    paymaster: "https://bsc-megafuel-testnet.nodereal.io" as string | null,
  },
};

export type NetworkName = keyof typeof NETWORKS;

// Where agents are discovered (real supply lives on mainnet) and where jobs are
// settled (testnet by default, so a full journey costs nothing and is safe).
export const DISCOVERY_NETWORK: NetworkName = "bsc-mainnet";
export const SETTLEMENT_NETWORK: NetworkName =
  (process.env.NEXT_PUBLIC_SETTLEMENT_NETWORK as NetworkName) || "bsc-testnet";

export const identityAbi = parseAbi([
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function getAgentWallet(uint256 agentId) view returns (address)",
]);

export const commerceAbi = parseAbi([
  "function jobCounter() view returns (uint256)",
  "function paymentToken() view returns (address)",
  "function platformFeeBP() view returns (uint256)",
  "function jobs(uint256 jobId) view returns (uint256 id, address client, address provider, address evaluator, string description, uint256 budget, uint256 expiredAt, uint8 status, address hook, uint256 fundedAt, bytes32 deliverable)",
  "function createJob(address provider, address evaluator, uint256 expiredAt, string description, address hook) returns (uint256)",
  "function setBudget(uint256 jobId, uint256 amount, bytes optParams)",
  "function fund(uint256 jobId, uint256 expectedBudget, bytes optParams)",
  "function submit(uint256 jobId, bytes32 deliverable, bytes optParams)",
  "function claimRefund(uint256 jobId)",
  "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
  "event JobFunded(uint256 indexed jobId, address indexed client, address indexed provider, uint256 amount)",
  "event JobSubmitted(uint256 indexed jobId, address indexed provider, bytes32 deliverable)",
  "event JobCompleted(uint256 indexed jobId, address indexed evaluator, bytes32 reason)",
  "event PaymentReleased(uint256 indexed jobId, address indexed provider, uint256 amount)",
  "event BudgetSet(uint256 indexed jobId, uint256 amount)",
]);

export const routerAbi = parseAbi([
  "function registerJob(uint256 jobId, address policy)",
  "function settle(uint256 jobId, bytes evidence)",
  "function jobPolicy(uint256 jobId) view returns (address)",
]);

export const policyAbi = parseAbi([
  "function disputeWindow() view returns (uint64)",
  "function submittedAt(uint256 jobId) view returns (uint64)",
  "function dispute(uint256 jobId)",
]);

export const erc20Abi = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const JOB_STATUS = [
  "OPEN",
  "FUNDED",
  "SUBMITTED",
  "COMPLETED",
  "REJECTED",
  "EXPIRED",
  "REFUNDED",
] as const;

export type JobStatusName = (typeof JOB_STATUS)[number];

export function publicClientFor(net: NetworkName) {
  const n = NETWORKS[net];
  return createPublicClient({
    chain: n.chain,
    transport: http(n.rpc, { timeout: 20_000, retryCount: 2 }),
  });
}

export const net = (n: NetworkName) => NETWORKS[n];

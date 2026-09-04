import { createWalletClient, http, encodeFunctionData, decodeEventLog, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  publicClientFor,
  primaryRpc,
  net,
  commerceAbi,
  routerAbi,
  policyAbi,
  erc20Abi,
  JOB_STATUS,
  type NetworkName,
} from "@/lib/live/chain";

// The ERC-8183 job lifecycle. A job is always created on the chain where the
// provider actually lives, naming that provider, so the seller can see it and
// work for it. Nothing here assumes testnet.
//
//   createJob -> registerJob -> setBudget -> (approve) -> fund
//     -> the provider submits its deliverable
//     -> dispute window
//     -> settle -> COMPLETED
//
// Gas is sponsored by MegaFuel on both networks for every buyer-side call
// (createJob, registerJob, setBudget, fund, approve, settle). Only `submit` is
// unsponsored, and that is the provider's own transaction to pay for.

export interface StepRecord {
  step: string;
  txHash: string;
  block: number;
  status: string;
  gasUsed: number;
  sponsored: boolean;
  explorer: string;
}

export interface OpenResult {
  jobId: string;
  network: NetworkName;
  chainId: number;
  status: string;
  budgetRaw: string;
  budgetDisplay: string;
  client: string;
  provider: string;
  deliverable: string;
  steps: StepRecord[];
  disputeWindowSeconds: number;
  settleAvailableAt: string | null;
  contracts: { commerce: string; router: string; policy: string; paymentToken: string };
}

function clientAccount() {
  const pk = process.env.SETTLEMENT_CLIENT_KEY as Hex | undefined;
  if (!pk) throw new Error("SETTLEMENT_CLIENT_KEY is not configured");
  return privateKeyToAccount(pk);
}

function providerAccount() {
  const pk = process.env.SETTLEMENT_PROVIDER_KEY as Hex | undefined;
  if (!pk) throw new Error("SETTLEMENT_PROVIDER_KEY is not configured");
  return privateKeyToAccount(pk);
}

async function rpc(url: string, method: string, params: unknown[]) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const j = (await r.json()) as { result?: unknown; error?: unknown };
  if (j.error) throw new Error(`${method}: ${JSON.stringify(j.error).slice(0, 240)}`);
  return j.result;
}

async function retry<T>(label: string, fn: () => Promise<T>, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
  throw new Error(`${label}: ${(last as Error)?.message ?? "failed"}`);
}

export class Erc8183Settlement {
  readonly network: NetworkName;
  private readonly n: ReturnType<typeof net>;
  private readonly pub: ReturnType<typeof publicClientFor>;

  constructor(network: NetworkName) {
    this.network = network;
    this.n = net(network);
    this.pub = publicClientFor(network);
  }

  private async send(
    acct: ReturnType<typeof privateKeyToAccount>,
    to: string,
    data: Hex,
    label: string,
    steps: StepRecord[],
  ) {
    const gas = await retry(`${label}/estimateGas`, () =>
      this.pub.estimateGas({ account: acct.address, to: to as Hex, data }),
    );
    const nonce = await retry(`${label}/nonce`, () =>
      this.pub.getTransactionCount({ address: acct.address, blockTag: "pending" }),
    );

    let sponsored = false;
    let hash: Hex;

    if (this.n.paymaster) {
      const spon = (await rpc(this.n.paymaster, "pm_isSponsorable", [
        { from: acct.address, to, value: "0x0", data },
      ]).catch(() => null)) as { sponsorable?: boolean } | null;
      if (spon?.sponsorable) {
        const wallet = createWalletClient({ account: acct, chain: this.n.chain, transport: http(primaryRpc(this.network)) });
        const raw = await wallet.signTransaction({
          to: to as Hex,
          data,
          value: 0n,
          gas: (gas * 12n) / 10n,
          gasPrice: 0n,
          nonce,
          type: "legacy",
        });
        hash = (await retry(`${label}/sponsoredSend`, () =>
          rpc(this.n.paymaster!, "eth_sendRawTransaction", [raw]),
        )) as Hex;
        sponsored = true;
      } else {
        hash = await this.selfPay(acct, to, data, gas, nonce);
      }
    } else {
      hash = await this.selfPay(acct, to, data, gas, nonce);
    }

    const rcpt = await retry(`${label}/receipt`, () =>
      this.pub.waitForTransactionReceipt({ hash, timeout: 180_000 }),
    );
    steps.push({
      step: label,
      txHash: hash,
      block: Number(rcpt.blockNumber),
      status: rcpt.status,
      gasUsed: Number(rcpt.gasUsed),
      sponsored,
      explorer: `${this.n.explorer}/tx/${hash}`,
    });
    if (rcpt.status !== "success") throw new Error(`${label} reverted`);
    return rcpt;
  }

  private async selfPay(
    acct: ReturnType<typeof privateKeyToAccount>,
    to: string,
    data: Hex,
    gas: bigint,
    nonce: number,
  ): Promise<Hex> {
    const wallet = createWalletClient({ account: acct, chain: this.n.chain, transport: http(primaryRpc(this.network)) });
    return wallet.sendTransaction({ to: to as Hex, data, gas: (gas * 12n) / 10n, nonce });
  }

  async token() {
    const address = await this.pub.readContract({
      address: this.n.commerce,
      abi: commerceAbi,
      functionName: "paymentToken",
    });
    const [symbol, decimals] = await Promise.all([
      this.pub.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
      this.pub.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
    ]);
    return { address, symbol, decimals: Number(decimals) };
  }

  async escrowBalance() {
    const tok = await this.token();
    const buyer = clientAccount();
    const raw = await this.pub.readContract({
      address: tok.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [buyer.address],
    });
    return {
      address: buyer.address,
      raw: raw.toString(),
      display: `${Number(raw) / 10 ** tok.decimals} ${tok.symbol}`,
      symbol: tok.symbol,
      decimals: tok.decimals,
      token: tok.address,
    };
  }

  async jobState(jobId: bigint) {
    const j = await this.pub.readContract({
      address: this.n.commerce,
      abi: commerceAbi,
      functionName: "jobs",
      args: [jobId],
    });
    return {
      status: JOB_STATUS[Number(j[7])] ?? String(j[7]),
      client: j[1],
      provider: j[2],
      budgetRaw: j[5].toString(),
      deliverable: j[10],
      description: j[4],
    };
  }

  async disputeWindow() {
    return Number(
      await this.pub.readContract({ address: this.n.policy, abi: policyAbi, functionName: "disputeWindow" }),
    );
  }

  /**
   * The buyer's half: escrow value against a named provider. Never submits.
   *
   * Every step is conditional on the job's current on-chain state, so a run
   * interrupted by a flaky RPC can be resumed with `resumeJobId` instead of
   * stranding a created job and minting another.
   */
  async open(opts: {
    provider: string;
    budgetRaw: bigint;
    description: string;
    resumeJobId?: bigint;
  }): Promise<OpenResult> {
    const buyer = clientAccount();
    const steps: StepRecord[] = [];
    const tok = await this.token();
    const window = await this.disputeWindow();

    if (opts.budgetRaw > 0n) {
      const held = await this.pub.readContract({
        address: tok.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [buyer.address],
      });
      if (held < opts.budgetRaw) {
        throw new Error(
          `Escrow account holds ${Number(held) / 10 ** tok.decimals} ${tok.symbol} on ${this.network}, ` +
            `but this job costs ${Number(opts.budgetRaw) / 10 ** tok.decimals} ${tok.symbol}. ` +
            `Fund ${buyer.address} with ${tok.symbol} on ${this.network} to hire this agent.`,
        );
      }
    }

    // Expiry must outlast the dispute window or a job can expire before it is
    // ever allowed to settle. Mainnet's window is a week, not fifteen minutes.
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + window + 3 * 24 * 3600);

    let jobId: bigint | null = opts.resumeJobId ?? null;

    if (jobId === null) {
      const r1 = await this.send(
        buyer,
        this.n.commerce,
        encodeFunctionData({
          abi: commerceAbi,
          functionName: "createJob",
          args: [opts.provider as Hex, this.n.router, expiredAt, opts.description, this.n.router],
        }),
        "createJob",
        steps,
      );
      for (const log of r1.logs) {
        try {
          const d = decodeEventLog({ abi: commerceAbi, data: log.data, topics: log.topics });
          if (d.eventName === "JobCreated") jobId = (d.args as { jobId: bigint }).jobId;
        } catch {
          /* logs from the router and policy contracts */
        }
      }
      if (jobId === null) throw new Error("createJob succeeded but emitted no JobCreated");
    }

    // Bind the policy only if it is not already bound.
    const boundPolicy = await this.pub
      .readContract({ address: this.n.router, abi: routerAbi, functionName: "jobPolicy", args: [jobId] })
      .catch(() => "0x0000000000000000000000000000000000000000" as Hex);
    if (BigInt(boundPolicy) === 0n) {
      await this.send(
        buyer,
        this.n.router,
        encodeFunctionData({ abi: routerAbi, functionName: "registerJob", args: [jobId, this.n.policy] }),
        "registerJob",
        steps,
      );
    }

    const current = await this.jobState(jobId);
    if (BigInt(current.budgetRaw) !== opts.budgetRaw && current.status === "OPEN") {
      await this.send(
        buyer,
        this.n.commerce,
        encodeFunctionData({ abi: commerceAbi, functionName: "setBudget", args: [jobId, opts.budgetRaw, "0x"] }),
        "setBudget",
        steps,
      );
    }

    if (opts.budgetRaw > 0n && (await this.jobState(jobId)).status === "OPEN") {
      const allowance = await this.pub.readContract({
        address: tok.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [buyer.address, this.n.commerce],
      });
      if (allowance < opts.budgetRaw) {
        await this.send(
          buyer,
          tok.address,
          encodeFunctionData({
            abi: parseAbi(["function approve(address,uint256) returns (bool)"]),
            functionName: "approve",
            args: [this.n.commerce, opts.budgetRaw],
          }),
          "approve",
          steps,
        );
      }
    }

    if ((await this.jobState(jobId)).status === "OPEN") {
      await this.send(
        buyer,
        this.n.commerce,
        encodeFunctionData({ abi: commerceAbi, functionName: "fund", args: [jobId, opts.budgetRaw, "0x"] }),
        "fund",
        steps,
      );
    }

    return this.describe(jobId, steps, window);
  }

  /** Only used when Mandate itself is the provider, for testnet demo jobs. */
  async selfSubmit(jobId: bigint, deliverableHash: Hex, steps: StepRecord[]) {
    await this.send(
      providerAccount(),
      this.n.commerce,
      encodeFunctionData({ abi: commerceAbi, functionName: "submit", args: [jobId, deliverableHash, "0x"] }),
      "submit",
      steps,
    );
  }

  /** Wait for the provider to record its deliverable on chain. */
  async awaitDelivery(
    jobId: bigint,
    timeoutMs: number,
  ): Promise<{ delivered: boolean; status: string; deliverable: string }> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.jobState(jobId);
      if (s.status === "SUBMITTED" || s.status === "COMPLETED")
        return { delivered: true, status: s.status, deliverable: s.deliverable };
      if (s.status === "REJECTED" || s.status === "EXPIRED" || s.status === "REFUNDED")
        return { delivered: false, status: s.status, deliverable: s.deliverable };
      if (Date.now() > deadline) return { delivered: false, status: s.status, deliverable: s.deliverable };
      await new Promise((r) => setTimeout(r, 6000));
    }
  }

  async describe(jobId: bigint, steps: StepRecord[], window?: number): Promise<OpenResult> {
    const state = await this.jobState(jobId);
    const tok = await this.token();
    const w = window ?? (await this.disputeWindow());
    let settleAvailableAt: string | null = null;
    try {
      const submittedAt = Number(
        await this.pub.readContract({
          address: this.n.policy,
          abi: policyAbi,
          functionName: "submittedAt",
          args: [jobId],
        }),
      );
      if (submittedAt > 0) settleAvailableAt = new Date((submittedAt + w) * 1000).toISOString();
    } catch {
      /* nothing submitted yet */
    }
    return {
      jobId: jobId.toString(),
      network: this.network,
      chainId: this.n.chainId,
      status: state.status,
      budgetRaw: state.budgetRaw,
      budgetDisplay: `${Number(state.budgetRaw) / 10 ** tok.decimals} ${tok.symbol}`,
      client: state.client,
      provider: state.provider,
      deliverable: state.deliverable,
      steps,
      disputeWindowSeconds: w,
      settleAvailableAt,
      contracts: {
        commerce: this.n.commerce,
        router: this.n.router,
        policy: this.n.policy,
        paymentToken: tok.address,
      },
    };
  }

  /**
   * Find the transaction that released a job's escrow, for receipts whose
   * release happened in an earlier call or was triggered by someone else.
   */
  async findCompletionStep(jobId: bigint): Promise<StepRecord | undefined> {
    try {
      const latest = await this.pub.getBlockNumber();
      const span = BigInt(Math.ceil(((await this.disputeWindow()) + 7200) / 3));
      const logs = await this.pub.getContractEvents({
        address: this.n.commerce,
        abi: commerceAbi,
        eventName: "JobCompleted",
        args: { jobId },
        fromBlock: latest > span ? latest - span : 0n,
        toBlock: latest,
      });
      const hit = logs.at(-1);
      if (!hit) return undefined;
      const [rcpt, tx] = await Promise.all([
        this.pub.getTransactionReceipt({ hash: hit.transactionHash }),
        this.pub.getTransaction({ hash: hit.transactionHash }),
      ]);
      return {
        step: "settle",
        txHash: hit.transactionHash,
        block: Number(rcpt.blockNumber),
        status: rcpt.status,
        gasUsed: Number(rcpt.gasUsed),
        sponsored: (tx.gasPrice ?? 0n) === 0n,
        explorer: `${this.n.explorer}/tx/${hit.transactionHash}`,
      };
    } catch {
      return undefined;
    }
  }

  /** Release escrow once the dispute window has passed. Permissionless. */
  async settle(jobId: bigint): Promise<{ settled: boolean; reason?: string; step?: StepRecord; status: string }> {
    const state = await this.jobState(jobId);
    if (state.status === "COMPLETED")
      return { settled: true, status: state.status, step: await this.findCompletionStep(jobId) };
    if (state.status !== "SUBMITTED")
      return { settled: false, reason: `job is ${state.status}, not SUBMITTED`, status: state.status };

    const window = await this.disputeWindow();
    const submittedAt = Number(
      await this.pub.readContract({
        address: this.n.policy,
        abi: policyAbi,
        functionName: "submittedAt",
        args: [jobId],
      }),
    );
    const readyAt = submittedAt + window;
    const now = Math.floor(Date.now() / 1000);
    if (now < readyAt)
      return {
        settled: false,
        reason: `dispute window open for another ${readyAt - now}s`,
        status: state.status,
      };

    const steps: StepRecord[] = [];
    await this.send(
      clientAccount(),
      this.n.router,
      encodeFunctionData({ abi: routerAbi, functionName: "settle", args: [jobId, "0x"] }),
      "settle",
      steps,
    );
    const after = await this.jobState(jobId);
    return { settled: after.status === "COMPLETED", step: steps[0], status: after.status };
  }
}

const cache = new Map<NetworkName, Erc8183Settlement>();
export function settlementFor(network: NetworkName): Erc8183Settlement {
  let s = cache.get(network);
  if (!s) {
    s = new Erc8183Settlement(network);
    cache.set(network, s);
  }
  return s;
}

export function escrowAddress(): string {
  return clientAccount().address;
}

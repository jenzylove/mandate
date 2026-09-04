import { createWalletClient, http, encodeFunctionData, decodeEventLog, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  publicClientFor,
  net,
  commerceAbi,
  routerAbi,
  policyAbi,
  erc20Abi,
  JOB_STATUS,
  SETTLEMENT_NETWORK,
  type NetworkName,
} from "@/lib/live/chain";

// The ERC-8183 job lifecycle, exactly as proved on chain:
//   createJob -> registerJob -> setBudget -> (approve) -> fund -> submit
//   -> wait out the dispute window -> settle -> COMPLETED
//
// On testnet every write is sponsored by the MegaFuel paymaster: ask
// pm_isSponsorable, then broadcast a gasPrice-0 raw transaction through the
// paymaster's own RPC. The caller pays no gas at all.

export interface StepRecord {
  step: string;
  txHash: string;
  block: number;
  status: string;
  gasUsed: number;
  sponsored: boolean;
  explorer: string;
}

export interface SettlementResult {
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

function accounts(network: NetworkName) {
  const clientPk = process.env.SETTLEMENT_CLIENT_KEY as Hex | undefined;
  const providerPk = process.env.SETTLEMENT_PROVIDER_KEY as Hex | undefined;
  if (!clientPk || !providerPk) {
    throw new Error(
      "Settlement keys are not configured. Set SETTLEMENT_CLIENT_KEY and SETTLEMENT_PROVIDER_KEY.",
    );
  }
  void network;
  return { client: privateKeyToAccount(clientPk), provider: privateKeyToAccount(providerPk) };
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

  constructor(network: NetworkName = SETTLEMENT_NETWORK) {
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
      const tx = { from: acct.address, to, value: "0x0", data };
      const spon = (await rpc(this.n.paymaster, "pm_isSponsorable", [tx]).catch(() => null)) as
        | { sponsorable?: boolean }
        | null;
      if (spon?.sponsorable) {
        const wallet = createWalletClient({ account: acct, chain: this.n.chain, transport: http(this.n.rpc) });
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
    const wallet = createWalletClient({ account: acct, chain: this.n.chain, transport: http(this.n.rpc) });
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
   * Escrow a job and record the provider's deliverable. Stops at SUBMITTED:
   * settlement has to wait out the dispute window, which is the whole point of
   * an optimistic policy.
   */
  async openAndDeliver(opts: {
    budgetRaw: bigint;
    description: string;
    deliverableHash: Hex;
  }): Promise<SettlementResult> {
    const { client, provider } = accounts(this.network);
    const steps: StepRecord[] = [];
    const tok = await this.token();
    const window = await this.disputeWindow();
    const expiredAt = BigInt(Math.floor(Date.now() / 1000) + window + 1800);

    const r1 = await this.send(
      client,
      this.n.commerce,
      encodeFunctionData({
        abi: commerceAbi,
        functionName: "createJob",
        args: [provider.address, this.n.router, expiredAt, opts.description, this.n.router],
      }),
      "createJob",
      steps,
    );

    let jobId: bigint | null = null;
    for (const log of r1.logs) {
      try {
        const d = decodeEventLog({ abi: commerceAbi, data: log.data, topics: log.topics });
        if (d.eventName === "JobCreated") jobId = (d.args as { jobId: bigint }).jobId;
      } catch {
        /* logs emitted by the router and policy contracts */
      }
    }
    if (jobId === null) throw new Error("createJob succeeded but emitted no JobCreated");

    await this.send(
      client,
      this.n.router,
      encodeFunctionData({ abi: routerAbi, functionName: "registerJob", args: [jobId, this.n.policy] }),
      "registerJob",
      steps,
    );

    await this.send(
      client,
      this.n.commerce,
      encodeFunctionData({ abi: commerceAbi, functionName: "setBudget", args: [jobId, opts.budgetRaw, "0x"] }),
      "setBudget",
      steps,
    );

    if (opts.budgetRaw > 0n) {
      const allowance = await this.pub.readContract({
        address: tok.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [client.address, this.n.commerce],
      });
      if (allowance < opts.budgetRaw) {
        await this.send(
          client,
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

    await this.send(
      client,
      this.n.commerce,
      encodeFunctionData({ abi: commerceAbi, functionName: "fund", args: [jobId, opts.budgetRaw, "0x"] }),
      "fund",
      steps,
    );

    await this.send(
      provider,
      this.n.commerce,
      encodeFunctionData({
        abi: commerceAbi,
        functionName: "submit",
        args: [jobId, opts.deliverableHash, "0x"],
      }),
      "submit",
      steps,
    );

    const state = await this.jobState(jobId);
    const submittedAt = Number(
      await this.pub.readContract({
        address: this.n.policy,
        abi: policyAbi,
        functionName: "submittedAt",
        args: [jobId],
      }),
    );

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
      disputeWindowSeconds: window,
      settleAvailableAt: new Date((submittedAt + window) * 1000).toISOString(),
      contracts: {
        commerce: this.n.commerce,
        router: this.n.router,
        policy: this.n.policy,
        paymentToken: tok.address,
      },
    };
  }

  /**
   * Find the transaction that released a job's escrow. Used when a job was
   * settled by an earlier call (or by anyone else, since settle is
   * permissionless) so the receipt can still show the release onchain.
   */
  async findCompletionStep(jobId: bigint): Promise<StepRecord | undefined> {
    try {
      const latest = await this.pub.getBlockNumber();
      // The dispute window bounds how far back to look; testnet blocks are ~3s.
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
      const rcpt = await this.pub.getTransactionReceipt({ hash: hit.transactionHash });
      const tx = await this.pub.getTransaction({ hash: hit.transactionHash });
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

    const { client } = accounts(this.network);
    const steps: StepRecord[] = [];
    await this.send(
      client,
      this.n.router,
      encodeFunctionData({ abi: routerAbi, functionName: "settle", args: [jobId, "0x"] }),
      "settle",
      steps,
    );
    const after = await this.jobState(jobId);
    return { settled: after.status === "COMPLETED", step: steps[0], status: after.status };
  }
}

export const settlement = new Erc8183Settlement();

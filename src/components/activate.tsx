"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ConnectWallet } from "./connect-wallet";

// Hiring an agent is the first thing in the product that touches a chain, so
// this is the first place a wallet is asked for. Browsing, comparing and
// matching all stay open.

export interface HireTarget {
  agentId: string;
  agentName: string;
  category: string;
  pricing: string;
  request: string;
  outcomeId?: string;
  settlementLabel: string;
  live: boolean;
}

interface Step {
  step: string;
  txHash: string;
  block: number;
  status: string;
  gasUsed: number;
  sponsored: boolean;
  explorer: string;
}

interface Receipt {
  id: string;
  jobId: string | null;
  agentName: string;
  status: string;
  mode: "paid" | "free";
  settlementLabel: string;
  price: { display: string; quotedByAgent: boolean };
  delivery: { kind: string; label: string; content: string; hash: string };
  chain: { steps: Step[]; settleAvailableAt: string | null; disputeWindowSeconds: number } | null;
  caveats: string[];
}

function remember(address: string, id: string) {
  try {
    const key = `mandate:jobs:v1:${address.toLowerCase()}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    if (!existing.includes(id))
      localStorage.setItem(key, JSON.stringify([...existing, id]));
  } catch {
    /* private browsing or storage disabled; the receipt still exists server-side */
  }
}

interface Preflight {
  canHire: boolean;
  mode: "paid" | "free";
  price?: string;
  networkLabel?: string;
  provider?: string;
  disputeWindowSeconds?: number;
  escrow?: { address: string; balance: string };
  reason: string;
}

export function ActivateAgent({ target }: { target: HireTarget }) {
  const { address, isConnected } = useAccount();
  const [phase, setPhase] = useState<"idle" | "hiring" | "settling" | "done" | "error">("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);
  const [pre, setPre] = useState<Preflight | null>(null);

  // Ask whether this hire can complete before offering it. A call to action
  // that cannot finish is worse than one that is honestly unavailable.
  useEffect(() => {
    if (!target.live) return;
    let cancelled = false;
    fetch(`/api/hire/preflight?agentId=${encodeURIComponent(target.agentId)}`)
      .then((r) => r.json())
      .then((j: Preflight & { ok: boolean }) => {
        if (!cancelled && j.ok) setPre(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [target.agentId, target.live]);

  const settle = useCallback(async (id: string) => {
    setPhase("settling");
    const res = await fetch("/api/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = (await res.json()) as { ok: boolean; receipt?: Receipt; error?: string };
    if (json.ok && json.receipt) {
      setReceipt(json.receipt);
      if (json.receipt.status === "COMPLETED" || json.receipt.status === "DELIVERED") {
        setPhase("done");
        return true;
      }
    }
    return false;
  }, []);

  // Poll only while a release is plausibly close. A week-long mainnet window is
  // not something to sit and watch, so we stop and let the receipt carry the date.
  useEffect(() => {
    if (phase !== "settling" || !receipt?.chain?.settleAvailableAt) return;
    const target = new Date(receipt.chain.settleAvailableAt).getTime();
    if (target - Date.now() > 30 * 60 * 1000) return;
    const tick = setInterval(async () => {
      const left = Math.max(0, Math.round((target - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) {
        const ok = await settle(receipt.id);
        if (ok) clearInterval(tick);
      }
    }, 5000);
    return () => clearInterval(tick);
  }, [phase, receipt, settle]);

  if (!target.live) {
    return (
      <section className="panel">
        <p className="eyebrow">DEMO LISTING · NOT ACTIVATABLE</p>
        <h2>This is a seeded example.</h2>
        <p>
          This listing is placeholder inventory used to keep the category
          populated. It has no onchain identity and cannot be hired.
        </p>
      </section>
    );
  }

  if (!isConnected) {
    return (
      <section className="panel wallet-gate">
        <span className="goal-icon butter">◇</span>
        <p className="eyebrow">SIGN IN TO ACTIVATE</p>
        <h2>Ready when you are.</h2>
        <p>
          {pre
            ? pre.mode === "free"
              ? `${target.agentName} charges nothing for this. Connect your wallet so the result is filed against your account.`
              : `Hiring ${target.agentName} opens an escrow job on ${pre.networkLabel ?? "BNB Smart Chain"}, against the agent's own payout address. Connect your wallet to continue.`
            : `Connect your wallet to hire ${target.agentName}. Browsing and matching stay open to everyone.`}
        </p>
        <ConnectWallet />
        <p className="flow-note">
          Connecting does not move your funds. Escrow is funded by Mandate&apos;s
          settlement account
          {pre?.escrow ? ` (${pre.escrow.address.slice(0, 6)}…${pre.escrow.address.slice(-4)})` : ""}.
        </p>
      </section>
    );
  }

  if (receipt) {
    return (
      <section className="panel">
        <p className="eyebrow">
          {receipt.mode === "free"
            ? "DELIVERED · NO PAYMENT REQUIRED"
            : receipt.status === "COMPLETED"
              ? "SETTLED ONCHAIN"
              : `ESCROW ${receipt.status}`}
        </p>
        <h2>{receipt.agentName}</h2>
        <div className="review-summary">
          {receipt.jobId && <span>Job #{receipt.jobId}</span>}
          <span>{receipt.price.display}</span>
          <span>{receipt.settlementLabel}</span>
        </div>

        {receipt.chain && receipt.status !== "COMPLETED" && (
          <p className="flow-note" role="status">
            Your result is above and yours to keep. Escrow releases to the agent
            automatically after the dispute window
            {receipt.chain.settleAvailableAt
              ? `, on ${new Date(receipt.chain.settleAvailableAt).toISOString().replace("T", " ").slice(0, 16)} UTC`
              : ""}
            {countdown !== null ? ` (in ${countdown}s)` : ""}.
          </p>
        )}

        <p>{receipt.delivery.label}</p>
        <pre className="deliverable">{receipt.delivery.content.slice(0, 4000)}</pre>

        {receipt.chain && (
        <div className="role-row">
          <p>Onchain steps</p>
          {receipt.chain.steps.map((s) => (
            <p key={s.txHash}>
              {s.step} ·{" "}
              <a href={s.explorer} target="_blank" rel="noreferrer">
                {s.txHash.slice(0, 10)}…{s.txHash.slice(-6)} ↗
              </a>{" "}
              · block {s.block}
              {s.sponsored ? " · gas sponsored" : ""}
            </p>
          ))}
        </div>
        )}

        {receipt.caveats.length > 0 && (
          <div className="notice">
            {receipt.caveats.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        )}

        <div className="page-actions">
          <Link className="button primary" href={`/my-outcomes/${receipt.id}`}>
            View receipt ↗
          </Link>
          <Link className="button secondary" href="/my-outcomes">
            My outcomes
          </Link>
        </div>
      </section>
    );
  }

  if (pre && !pre.canHire) {
    return (
      <section className="panel">
        <p className="eyebrow">HIRING PAUSED</p>
        <h2>{target.agentName} cannot be hired right now.</h2>
        <p>{pre.reason}</p>
        {pre.escrow && (
          <div className="review-summary">
            <span>{pre.price}</span>
            <span>{pre.networkLabel}</span>
            <span>escrow holds {pre.escrow.balance}</span>
          </div>
        )}
        <p className="flow-note">
          Nothing has been charged and no job was created. Everything else on this
          page is live.
        </p>
      </section>
    );
  }

  const window = pre?.disputeWindowSeconds;
  const windowLabel =
    window && window >= 86400
      ? `${Math.round(window / 86400)} days`
      : window
        ? `${Math.round(window / 60)} minutes`
        : null;

  return (
    <section className="panel">
      <p className="eyebrow">ACTIVATE THIS AGENT</p>
      <h2>Hire {target.agentName}.</h2>
      <p>
        {pre?.mode === "free"
          ? "This agent publishes its tools free of charge. There is nothing to escrow, so you get the result straight away."
          : `This opens a real ERC-8183 escrow job on ${pre?.networkLabel ?? target.settlementLabel}, against the agent's own payout address. You get the deliverable as soon as it is submitted${windowLabel ? `; escrow releases to the agent after a ${windowLabel} dispute window` : ""}.`}
      </p>
      <div className="review-summary">
        <span>{pre?.price ?? target.pricing}</span>
        <span>{target.category.replaceAll("-", " ")}</span>
        <span>{pre?.mode === "free" ? "No payment required" : "Escrowed, not prepaid"}</span>
      </div>
      <div className="page-actions">
        <button
          className="button primary"
          disabled={phase === "hiring"}
          onClick={async () => {
            setPhase("hiring");
            setError("");
            try {
              const res = await fetch("/api/hire", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  agentId: target.agentId,
                  buyer: address,
                  outcomeId: target.outcomeId,
                  request: target.request,
                }),
              });
              const json = (await res.json()) as { ok: boolean; receipt?: Receipt; error?: string };
              if (!json.ok || !json.receipt) throw new Error(json.error ?? "Activation failed");
              setReceipt(json.receipt);
              if (address) remember(address, json.receipt.id);
              setPhase(json.receipt.mode === "free" ? "done" : "settling");
            } catch (e) {
              setError((e as Error).message);
              setPhase("error");
            }
          }}
        >
          {phase === "hiring"
            ? pre?.mode === "free"
              ? "Asking the agent…"
              : "Opening escrow…"
            : pre?.mode === "free"
              ? "Get this result"
              : "Activate and escrow"}
        </button>
      </div>
      {phase === "hiring" && (
        <p className="flow-note" role="status">
          {pre?.mode === "free"
            ? "Calling the agent now."
            : "Negotiating with the agent, then creating and funding the job onchain, then waiting for it to deliver. This takes a minute or two."}
        </p>
      )}
      {error && (
        <p role="alert" className="flow-note">
          {error}
        </p>
      )}
    </section>
  );
}

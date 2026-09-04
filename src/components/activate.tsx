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
  jobId: string;
  agentName: string;
  status: string;
  settlementLabel: string;
  price: { display: string; quotedByAgent: boolean };
  delivery: { kind: string; label: string; content: string; hash: string };
  chain: { steps: Step[]; settleAvailableAt: string | null; disputeWindowSeconds: number };
  caveats: string[];
}

function remember(address: string, jobId: string) {
  try {
    const key = `mandate:jobs:v1:${address.toLowerCase()}`;
    const existing = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    if (!existing.includes(jobId))
      localStorage.setItem(key, JSON.stringify([...existing, jobId]));
  } catch {
    /* private browsing or storage disabled; the receipt still exists server-side */
  }
}

export function ActivateAgent({ target }: { target: HireTarget }) {
  const { address, isConnected } = useAccount();
  const [phase, setPhase] = useState<"idle" | "hiring" | "settling" | "done" | "error">("idle");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState<number | null>(null);

  const settle = useCallback(async (jobId: string) => {
    setPhase("settling");
    const res = await fetch("/api/settle", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobId }),
    });
    const json = (await res.json()) as { ok: boolean; receipt?: Receipt; error?: string };
    if (json.ok && json.receipt) {
      setReceipt(json.receipt);
      if (json.receipt.status === "COMPLETED") {
        setPhase("done");
        return true;
      }
    }
    return false;
  }, []);

  // The optimistic policy holds escrow for a fixed window; poll until it opens.
  useEffect(() => {
    if (phase !== "settling" || !receipt?.chain.settleAvailableAt) return;
    const target = new Date(receipt.chain.settleAvailableAt).getTime();
    const tick = setInterval(async () => {
      const left = Math.max(0, Math.round((target - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) {
        const ok = await settle(receipt.jobId);
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
          Hiring {target.agentName} opens an escrow job on {target.settlementLabel}.
          Connect your wallet to continue. Browsing and matching stay open to
          everyone.
        </p>
        <ConnectWallet />
        <p className="flow-note">
          Connecting does not move your funds. Escrow for this job is funded by
          Mandate&apos;s settlement account on {target.settlementLabel}.
        </p>
      </section>
    );
  }

  if (receipt) {
    return (
      <section className="panel">
        <p className="eyebrow">
          {receipt.status === "COMPLETED" ? "SETTLED ONCHAIN" : `ESCROW ${receipt.status}`}
        </p>
        <h2>{receipt.agentName}</h2>
        <div className="review-summary">
          <span>Job #{receipt.jobId}</span>
          <span>{receipt.price.display}</span>
          <span>{receipt.settlementLabel}</span>
        </div>

        {phase === "settling" && receipt.status !== "COMPLETED" && (
          <p className="flow-note" role="status">
            Escrow is held for a {receipt.chain.disputeWindowSeconds}s dispute
            window before it can be released
            {countdown !== null ? `. Releasing in ${countdown}s` : ""}. You can
            leave this page; the job stays on chain.
          </p>
        )}

        <p>{receipt.delivery.label}</p>
        <pre className="deliverable">{receipt.delivery.content.slice(0, 4000)}</pre>

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

        {receipt.caveats.length > 0 && (
          <div className="notice">
            {receipt.caveats.map((c) => (
              <p key={c}>{c}</p>
            ))}
          </div>
        )}

        <div className="page-actions">
          <Link className="button primary" href={`/my-outcomes/job-${receipt.jobId}`}>
            View receipt ↗
          </Link>
          <Link className="button secondary" href="/my-outcomes">
            My outcomes
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <p className="eyebrow">ACTIVATE THIS AGENT</p>
      <h2>Hire {target.agentName}.</h2>
      <p>
        This opens a real ERC-8183 escrow job on {target.settlementLabel}, records
        the agent&apos;s deliverable onchain, and releases payment after the
        dispute window.
      </p>
      <div className="review-summary">
        <span>{target.pricing}</span>
        <span>{target.category.replaceAll("-", " ")}</span>
        <span>Escrowed, not prepaid</span>
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
              if (address) remember(address, json.receipt.jobId);
              setPhase("settling");
            } catch (e) {
              setError((e as Error).message);
              setPhase("error");
            }
          }}
        >
          {phase === "hiring" ? "Opening escrow…" : "Activate and escrow"}
        </button>
      </div>
      {phase === "hiring" && (
        <p className="flow-note" role="status">
          Negotiating with the agent, then creating, funding and recording the
          job onchain. This takes about a minute.
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

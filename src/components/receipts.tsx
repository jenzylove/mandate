"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

// Receipts are the record of work that actually happened: a real ERC-8183 job,
// its onchain steps, and whatever the agent returned. They are stored against
// the buyer's address, so they survive a browser change.

export interface ReceiptStep {
  step: string;
  txHash: string;
  block: number;
  status: string;
  gasUsed: number;
  sponsored: boolean;
  explorer: string;
}

export interface ReceiptRecord {
  id: string;
  jobId: string | null;
  mode: "paid" | "free";
  agentId: string;
  agentName: string;
  category: string;
  buyer: string | null;
  outcomeId?: string;
  createdAt: string;
  settledAt?: string;
  status: string;
  settlementLabel: string;
  discoveryNetwork: string;
  price: { raw: string; display: string; currency: string; quotedByAgent: boolean };
  provider: { quotedAddress?: string; escrowAddress: string; onchainProvider?: string };
  delivery: { kind: string; label: string; content: string; hash: string };
  chain: { steps: ReceiptStep[]; settleAvailableAt: string | null; disputeWindowSeconds: number } | null;
  caveats: string[];
}

export function useReceipts(address?: string) {
  const [receipts, setReceipts] = useState<ReceiptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setReceipts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/receipts?buyer=${address}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; receipts?: ReceiptRecord[] }) => {
        if (!cancelled) setReceipts(j.receipts ?? []);
      })
      .catch(() => {
        if (!cancelled) setReceipts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);
  return { receipts, loading };
}

const statusLabel = (s: string) =>
  s === "COMPLETED"
    ? "SETTLED"
    : s === "SUBMITTED"
      ? "DELIVERED · ESCROW HELD"
      : s === "DELIVERED"
        ? "DELIVERED"
        : s;

export function ReceiptList({ receipts }: { receipts: ReceiptRecord[] }) {
  if (!receipts.length) return null;
  return (
    <>
      <div className="section-heading">
        <h2>Your activity</h2>
        <Link className="text-link" href="/agents">
          Hire another agent ↗
        </Link>
      </div>
      <div className="saved-list">
        {receipts.map((r) => (
          <Link className="saved-row" key={r.id} href={`/my-outcomes/${r.id}`}>
            <div>
              <p className="eyebrow">
                {statusLabel(r.status)}
                {r.jobId ? ` · JOB #${r.jobId}` : " · NO PAYMENT REQUIRED"}
              </p>
              <h3>{r.agentName}</h3>
              <p>
                {r.category.replaceAll("-", " ")} · {r.price.display} ·{" "}
                {new Date(r.createdAt).toISOString().slice(0, 10)}
              </p>
            </div>
            <span>View receipt ↗</span>
          </Link>
        ))}
      </div>
    </>
  );
}

export function ReceiptDetail({ receiptId }: { receiptId: string }) {
  const [receipt, setReceipt] = useState<ReceiptRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);

  const load = () =>
    fetch(`/api/receipts/${receiptId}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; receipt?: ReceiptRecord }) => setReceipt(j.receipt ?? null))
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptId]);

  if (loading)
    return (
      <div className="panel">
        <p>Loading receipt…</p>
      </div>
    );

  if (!receipt)
    return (
      <div className="empty-state">
        <h2>Receipt not found.</h2>
        <p>This job is not on record for this account.</p>
        <Link className="button secondary" href="/my-outcomes">
          My outcomes
        </Link>
      </div>
    );

  const canSettle = receipt.status === "SUBMITTED";

  return (
    <section className="panel">
      <p className="eyebrow">
        {statusLabel(receipt.status)} · {receipt.settlementLabel.toUpperCase()}
      </p>
      <h2>{receipt.agentName}</h2>
      <div className="review-summary">
        {receipt.jobId && <span>Job #{receipt.jobId}</span>}
        <span>{receipt.price.display}</span>
        <span>{receipt.category.replaceAll("-", " ")}</span>
        {receipt.price.quotedByAgent && <span>price quoted by the agent</span>}
      </div>

      <p>{receipt.delivery.label}</p>
      <pre className="deliverable">{receipt.delivery.content.slice(0, 8000)}</pre>

      {receipt.chain && (
      <div className="role-row">
        <p>Onchain settlement</p>
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
        <p>Deliverable hash: {receipt.delivery.hash}</p>
        <p>Escrow provider: {receipt.provider.escrowAddress}</p>
        {receipt.provider.quotedAddress && (
          <p>Agent&apos;s own payout address: {receipt.provider.quotedAddress}</p>
        )}
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
        {canSettle && (
          <button
            className="button primary"
            disabled={settling}
            onClick={async () => {
              setSettling(true);
              await fetch("/api/settle", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ id: receipt.id }),
              }).catch(() => null);
              await load();
              setSettling(false);
            }}
          >
            {settling ? "Releasing escrow…" : "Release escrow"}
          </button>
        )}
        <Link className="button secondary" href="/my-outcomes">
          Back to my outcomes
        </Link>
      </div>
      {canSettle && receipt.chain && (
        <p className="flow-note">
          Escrow is held for a {Math.round(receipt.chain.disputeWindowSeconds / 3600)}h dispute window
          after delivery
          {receipt.chain.settleAvailableAt
            ? `, which opens at ${new Date(receipt.chain.settleAvailableAt).toISOString().replace("T", " ").slice(0, 16)} UTC`
            : ""}
          . Releasing is permissionless once it passes.
        </p>
      )}
    </section>
  );
}

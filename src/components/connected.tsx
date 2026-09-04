"use client";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import Link from "next/link";
import { ConnectWallet } from "./connect-wallet";
export interface SavedSetup {
  id: string;
  name: string;
  outcomeId?: string;
  agentIds: string[];
  risk: string;
  control: string;
  asset?: string;
  protocol?: string;
}
const key = (address: string) => `mandate:drafts:v1:${address.toLowerCase()}`;
function read(address: string): SavedSetup[] {
  try {
    const items = JSON.parse(localStorage.getItem(key(address)) ?? "[]");
    return Array.isArray(items)
      ? items.filter(
          (x) =>
            x &&
            typeof x.id === "string" &&
            typeof x.name === "string" &&
            Array.isArray(x.agentIds),
        )
      : [];
  } catch {
    return [];
  }
}
export function WalletGate({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready)
    return (
      <div className="panel wallet-gate">
        <p>Checking wallet connection…</p>
      </div>
    );
  if (!isConnected)
    return (
      <section className="panel wallet-gate">
        <span className="goal-icon butter">◇</span>
        <p className="eyebrow">YOUR WALLET IS YOUR ACCOUNT</p>
        <h2>A home for your next move.</h2>
        <p>
          Connect your wallet to save setups and see your activity. Exploring
          outcomes and agents stays open to everyone.
        </p>
        <ConnectWallet />
        <p className="flow-note">
          Connecting does not move funds or grant spending permission.
        </p>
      </section>
    );
  return <>{children}</>;
}
export function SaveSetup({ setup }: { setup: SavedSetup }) {
  const { address } = useAccount();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setSaved(false);
    setError("");
  }, [address, setup.id]);
  return (
    <WalletGate>
      <section className="panel">
        <h2>Keep this setup for later.</h2>
        <p>
          Saved drafts stay in this browser, associated with your wallet. No
          transaction is submitted and no agent is activated.
        </p>
        <div className="page-actions">
          {saved ? (
            <Link className="button primary" href="/my-outcomes">
              View my saved setups ↗
            </Link>
          ) : (
            <button
              className="button primary"
              onClick={() => {
                if (!address) return;
                try {
                  const existing = read(address);
                  localStorage.setItem(
                    key(address),
                    JSON.stringify([
                      ...existing.filter((s) => s.id !== setup.id),
                      setup,
                    ]),
                  );
                  setSaved(true);
                } catch {
                  setError(
                    "Could not save in this browser. Check that local storage is enabled and try again.",
                  );
                }
              }}
            >
              Save demo setup
            </button>
          )}
        </div>
        {saved && (
          <p role="status" className="flow-note">
            Setup saved. Nothing has been activated.
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    </WalletGate>
  );
}
export function MyActivity({ id }: { id?: string }) {
  const { address } = useAccount();
  const [items, setItems] = useState<SavedSetup[]>([]);
  useEffect(() => setItems(address ? read(address) : []), [address]);
  const selected = id ? items.find((s) => s.id === id) : undefined;
  return (
    <WalletGate>
      <div className="notice">
        Wallet connected · Saved drafts on this device. Live positions and
        execution are not integrated.
      </div>
      {id ? (
        selected ? (
          <section className="panel">
            <p className="eyebrow">SAVED DEMO SETUP · NOT ACTIVE</p>
            <h2>{selected.name}</h2>
            <div className="review-summary">
              <span>{selected.risk} risk</span>
              <span>{selected.control}</span>
              <span>{selected.asset || "Any supported asset"}</span>
            </div>
            <p>Selected agents</p>
            {selected.agentIds.map((a) => (
              <div className="role-row" key={a}>
                <Link href={`/agents/${a}`}>{a} ↗</Link>
              </div>
            ))}
            <div className="page-actions">
              <Link className="button secondary" href="/my-outcomes">
                Back to my outcomes
              </Link>
            </div>
          </section>
        ) : (
          <div className="empty-state">
            <h2>Setup not found on this device.</h2>
            <p>Check the connected wallet or return to your saved setups.</p>
            <Link className="button secondary" href="/my-outcomes">
              My outcomes
            </Link>
          </div>
        )
      ) : (
        <>
          <div className="section-heading">
            <h2>Your saved setups</h2>
            <Link className="text-link" href="/find/goal">
              Find a new outcome ↗
            </Link>
          </div>
          {items.length ? (
            <div className="saved-list">
              {items.map((s) => (
                <Link
                  className="saved-row"
                  key={s.id}
                  href={`/my-outcomes/${encodeURIComponent(s.id)}`}
                >
                  <div>
                    <p className="eyebrow">SAVED DRAFT · DEMO</p>
                    <h3>{s.name}</h3>
                    <p>
                      {s.agentIds.length} agents · {s.risk} risk · {s.control}
                    </p>
                  </div>
                  <span>Review setup ↗</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <h2>Your next chapter starts here.</h2>
              <p>
                You have no saved setups in this browser. Find an outcome,
                compare your options, and save one to revisit.
              </p>
              <Link className="button primary" href="/find/goal">
                Find my first outcome ↗
              </Link>
            </div>
          )}
        </>
      )}
    </WalletGate>
  );
}

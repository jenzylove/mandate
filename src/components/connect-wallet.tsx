"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

// A wallet is optional context (PRD: fields prefill "where practical"), never a
// gate on browsing. This component reflects connection state and nothing more.
export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-md border border-line px-3 py-1.5 text-sm"
      >
        {address.slice(0, 6)}…{address.slice(-4)} · Disconnect
      </button>
    );
  }
  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper"
    >
      Connect wallet
    </button>
  );
}

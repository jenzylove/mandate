"use client";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [missing, setMissing] = useState(false);
  return (
    <div className="wallet-wrap">
      {isConnected && address ? (
        <button
          className="button secondary"
          onClick={() => disconnect()}
          title="Disconnect wallet"
        >
          {address.slice(0, 6)}…{address.slice(-4)} · Disconnect
        </button>
      ) : (
        <button
          className="button primary"
          disabled={isPending}
          onClick={async () => {
            setMissing(false);
            reset();
            const connector = connectors[0];
            if (!connector || !(await connector.getProvider())) {
              setMissing(true);
              return;
            }
            connect({ connector });
          }}
        >
          {isPending ? "Connecting…" : "Connect wallet"} <span>↗</span>
        </button>
      )}
      {(missing || error) && (
        <div className="wallet-error" role="alert">
          <button
            aria-label="Dismiss wallet message"
            onClick={() => {
              setMissing(false);
              reset();
            }}
          >
            ×
          </button>
          {missing
            ? "No browser wallet detected. Open Mandate in your wallet’s browser or use a browser with an Ethereum-compatible wallet installed."
            : "Connection was not completed. Check your wallet, then try again."}
        </div>
      )}
    </div>
  );
}

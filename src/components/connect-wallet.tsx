"use client";
import { useState } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { usePrivy } from "@privy-io/react-auth";
import { privyEnabled } from "@/config/privy";

// Sign in is account identity. It accepts an email address, a Google account or
// a wallet, and whichever is used the app ends up with one address it can file
// receipts against. Browsing never reaches this.
export function ConnectWallet() {
  return privyEnabled ? <PrivySignIn /> : <WalletOnlySignIn />;
}

function AccountButton({ address, onSignOut, label }: { address: string; onSignOut: () => void; label?: string }) {
  return (
    <button className="button secondary" onClick={onSignOut} title="Sign out">
      {label ?? "Account"} · {address.slice(0, 6)}…{address.slice(-4)}
    </button>
  );
}

function PrivySignIn() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();

  // Privy mints an embedded wallet for anyone who signs in without one, so an
  // address exists either way; prefer whatever wagmi has actually connected.
  const shown = address ?? user?.wallet?.address ?? null;
  const via = user?.email?.address ?? user?.google?.email ?? null;

  if (!ready) {
    return (
      <div className="wallet-wrap">
        <button className="button primary" disabled>
          Sign in <span>↗</span>
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-wrap">
      {authenticated && shown ? (
        <AccountButton address={shown} onSignOut={() => logout()} label={via ? via.split("@")[0] : "Account"} />
      ) : (
        <button className="button primary" onClick={() => login()}>
          Sign in <span>↗</span>
        </button>
      )}
    </div>
  );
}

function WalletOnlySignIn() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error, reset } = useConnect();
  const { disconnect } = useDisconnect();
  const [missing, setMissing] = useState(false);

  return (
    <div className="wallet-wrap">
      {isConnected && address ? (
        <AccountButton address={address} onSignOut={() => disconnect()} />
      ) : (
        <button
          className="button primary"
          disabled={isPending}
          onClick={async () => {
            setMissing(false);
            reset();
            // Prefer a wallet that is actually installed, Binance first, rather
            // than always taking the first connector and failing when the user
            // has a different wallet.
            let connector = null;
            for (const candidate of connectors) {
              try {
                if (await candidate.getProvider()) { connector = candidate; break; }
              } catch { /* this wallet is not present */ }
            }
            if (!connector) {
              setMissing(true);
              return;
            }
            connect({ connector });
          }}
        >
          {isPending ? "Signing in…" : "Sign in"} <span>↗</span>
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

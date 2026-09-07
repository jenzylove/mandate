import type { PrivyClientConfig } from "@privy-io/react-auth";
import { bsc, bscTestnet } from "viem/chains";

// Sign in with an email address or a Google account, not only a wallet.
//
// Hiring an agent still needs an address, so Privy mints an embedded wallet for
// anyone who arrives without one. That address is the account: receipts are
// filed against it exactly as they are for a self-custody wallet, so the rest
// of the app needs no notion of "logged in but walletless".
export const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export const privyConfig: PrivyClientConfig = {
  // Order is the order they appear. A BNB Chain marketplace still expects a
  // wallet-first audience, but email and Google are offered beside it rather
  // than behind it.
  loginMethods: ["wallet", "email", "google"],

  embeddedWallets: {
    // Only for people who signed in without one. A trader who connected their
    // own wallet keeps using it and is never given a second address.
    ethereum: { createOnLogin: "users-without-wallets" },
    showWalletUIs: true,
  },

  defaultChain: bsc,
  supportedChains: [bsc, bscTestnet],

  appearance: {
    theme: "light",
    accentColor: "#6850bb",
    walletList: [
      // The chain's own wallet first, then the usual suspects.
      "detected_wallets",
      "metamask",
      "wallet_connect",
      "coinbase_wallet",
    ],
    showWalletLoginFirst: true,
  },
};

// Nothing about Privy is required to browse. When no app id is configured the
// app falls back to wallet-only sign in rather than rendering a broken dialog.
export const privyEnabled = PRIVY_APP_ID.length > 0;

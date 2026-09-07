"use client";

import { WagmiProvider } from "wagmi";
import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider as PrivyWagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/config/chain";
import { PRIVY_APP_ID, privyConfig, privyEnabled } from "@/config/privy";

// Two ways in, one account model.
//
// With Privy configured, sign in accepts an email address or a Google account
// as well as a wallet, and Privy's own wagmi bridge feeds the resulting address
// to the same useAccount() the rest of the app already reads. Without it, the
// app falls back to plain wagmi and wallet-only sign in, so a missing app id
// degrades to the previous behaviour rather than a blank screen.
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  if (!privyEnabled) {
    return (
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </WagmiProvider>
    );
  }

  return (
    <PrivyProvider appId={PRIVY_APP_ID} config={privyConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivyWagmiProvider config={wagmiConfig}>{children}</PrivyWagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}

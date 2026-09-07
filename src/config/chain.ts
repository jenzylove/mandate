import { http, createConfig } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "@wagmi/core";

// BNB Smart Chain (mainnet + testnet). Injected connector keeps the MVP
// dependency-light; a richer connector set can be added without touching the
// UI. Transports use the public RPC by default.
export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  // A BNB Chain marketplace should reach for a BNB wallet first. Binance Wallet
  // injects itself as window.BinanceChain, which the generic injected connector
  // does not find, so it is named explicitly and listed ahead of the rest.
  connectors: [
    injected({
      target() {
        const w = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : undefined;
        const binance = w?.BinanceChain ?? w?.binancew3w;
        return {
          id: "binanceWallet",
          name: "Binance Wallet",
          provider: binance as never,
        };
      },
    }),
    injected(),
  ],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
  },
  ssr: true,
});

export const CHAINS = { bsc, bscTestnet };

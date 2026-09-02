import { http, createConfig } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// BNB Smart Chain (mainnet + testnet). Injected connector keeps the MVP
// dependency-light; a richer connector set can be added without touching the
// UI. Transports use the public RPC by default.
export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [injected()],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
  },
  ssr: true,
});

export const CHAINS = { bsc, bscTestnet };

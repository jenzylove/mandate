import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // Privy's wagmi bridge pulls in @wagmi/connectors, which reaches Coinbase's
    // Base Account connector, which reaches @coinbase/cdp-sdk, which imports
    // @x402/evm/* for a payment path we never touch. Those are optional peers
    // and are not installed, so the bundle fails to resolve them.
    //
    // Mandate does not use the Base Account connector at all: its wallets are
    // the injected ones listed in config/chain.ts. Dropping the unreachable
    // imports is therefore safe, and far safer than installing a payment SDK we
    // have no use for.
    // The same applies to the Farcaster and Solana mini-app connectors: optional
    // peers of @wagmi/connectors for wallets this marketplace does not offer.
    // React Native storage is the same story from MetaMask's SDK: a peer for a
    // platform this web app is not.
    const unusedOptionalPeers =
      /^(@x402\/|@farcaster\/|@solana\/|@react-native-async-storage\/)/;
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(
        unusedOptionalPeers,
        require.resolve("./src/lib/empty-module.js"),
      ),
    );
    return config;
  },
};
export default nextConfig;

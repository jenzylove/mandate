// Stub for optional peer dependencies of wallet connectors this app does not
// offer (Solana, Farcaster, Coinbase x402, React Native storage). They are
// imported unconditionally by @wagmi/connectors but only reached by code paths
// Mandate never enters, so an empty module is both correct and safe. Ignoring
// them instead would leave a "Cannot find module" throw at prerender time.
module.exports = {};

# The live marketplace layer

The UI at `fe8aa1d` is unchanged in structure. What changed is what sits
underneath it: seeded inventory was replaced by agents read from the ERC-8004
identity registry on BNB Smart Chain, and activation now opens a real ERC-8183
escrow job.

## Where data comes from

```
ERC-8004 registry (BSC mainnet)
        |  tokenURI -> registration file (https or inline data: URI)
        v
  discover.ts        resolve + classify transports (A2A / MCP / ERC8183 / x402 / web)
        |
        v
  agent-adapter.ts   ONE adapter: probe, quote, notify_funded, callTool
        |
        v
  qualify.ts         -> domain Agent + live availability, price, evidence
        |
        v
  snapshot.ts        data/live/agents.json, refreshed out of band
        |
        v
  live-adapter.ts    DataAdapter the pages already used
```

Nothing above `DataAdapter` moved. The pages import `data` from
`@/lib/data/live-adapter` instead of the JSON adapter, and that is the whole
integration seam.

## Honesty rules the code enforces

- An agent is `available` only if it **answered** when contacted. A card that
  resolves but whose endpoint refuses is `limited`; one that never connects is
  `offline`.
- `reputation` is a transparent function of verifiable facts (answered, declares
  ERC-8183, quoted a price, publishes skills or tools). The evidence panel lists
  every input.
- Price is whatever the agent quoted over A2A. Where none is quoted the listing
  says "Quoted on request" rather than inventing a number.
- Seeded listings are kept only for a category with no live supply, keep
  `source: "seed"`, and are labelled `DEMO AGENT` and refused activation.

## Settlement

Discovery and negotiation happen on **mainnet**, where the agents live. Escrow
settles on **testnet** by default, funded by Mandate's settlement account, so a
full journey costs nothing. Every receipt says so in its own caveats.

The lifecycle is the one proved on chain:

```
createJob -> registerJob -> setBudget -> (approve) -> fund -> submit
          -> dispute window (900s) -> settle -> COMPLETED
```

Gas is free on testnet: each write asks MegaFuel `pm_isSponsorable`, then
broadcasts a `gasPrice: 0` raw transaction through the paymaster. Self-pay is
the automatic fallback.

### Deliverables

Two kinds, never mixed:

| Kind | When | What is recorded |
| --- | --- | --- |
| `agent-output` | The agent exposes a free read-only MCP tool | Its real output |
| `negotiated-quote` | The agent only sells work behind mainnet escrow | The quote it signed for this request |

A deliverable is never fabricated. The `negotiated-quote` case carries an
explicit caveat saying it is a quote, not finished work.

## Wallet and account

Browsing, category pages, agent detail and the whole guided-matching flow work
with no wallet. A wallet is requested at exactly two points: saving a setup
against your address, and activating an agent. Connecting never moves funds.

## Refreshing supply

```bash
npm run dev
npm run refresh:live      # re-resolves every rostered agent and re-probes it
```

`data/live/agents.json` is the snapshot the app reads. Resolving and probing
twelve agents takes ~25s, which is why it is not done per request.

## Adding supply

Add an entry to `src/lib/live/roster.ts` with the onchain agent id, its
category, and the seller's own `serviceId`. Everything else (name, description,
skills, price, availability) is read from the agent itself. Nothing bespoke is
needed per agent: the common adapter covers A2A and MCP.

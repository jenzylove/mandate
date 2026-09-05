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

**A job is created on the chain where the provider actually lives, naming that
provider.** The seller reads the job from its own chain, sees itself named, does
the work and submits. There is no cross-chain mismatch to explain away.

The chain and the provider both come from the agent's own quote (`chain_id` and
`provider`), re-fetched at hire time because a snapshot price is a listing, not
a commitment.

```
createJob -> registerJob -> setBudget -> (approve) -> fund
          -> the agent submits its deliverable
          -> dispute window
          -> settle -> COMPLETED
```

Gas is free for the buyer on **both** networks: each write asks MegaFuel
`pm_isSponsorable`, then broadcasts a `gasPrice: 0` raw transaction through the
paymaster. Mainnet sponsorship is provided by Pieverse. Self-pay is the
automatic fallback. Only `submit` is unsponsored, and that is the provider's own
transaction.

Dispute windows differ sharply and the UI reflects it: **900 seconds on testnet,
7 days on mainnet**. The deliverable is yours the moment it is submitted; escrow
release is what waits.

### Two hire shapes, never mixed

| Mode | When | What happens |
| --- | --- | --- |
| `paid` | The agent quoted a price and a payout address | That exact amount is escrowed on that exact chain against that exact provider, the seller is notified, and we wait for it to submit real work |
| `free` | The agent publishes read-only tools and charges nothing | No job is created at all, and its actual output is the result |

A quote is never recorded as if it were finished work.

## Preflight

`GET /api/hire/preflight?agentId=` answers whether a hire can complete *before*
the button is shown. It returns `canHire: false` with a plain reason when the
escrow account is short of the quoted price, when the agent has stopped
answering, or when an agent neither quotes a price nor exposes a free tool (an
OAuth-gated seller, for instance). A call to action that cannot finish is worse
than one that is honestly unavailable.

## Wallet and account

Browsing, category pages, agent detail and the whole guided-matching flow work
with no wallet. A wallet is requested at exactly two points: saving a setup
against your address, and activating an agent. Connecting never moves funds.

## Freshness

No page render ever waits on a chain scan. `data/live/agents.json` is committed,
so a cold deploy serves a market immediately. From there:

- Requests read the snapshot from disk (memoised for 30s).
- A request that finds the snapshot older than 15 minutes kicks off a refresh in
  the background and serves the current data anyway. Concurrent refreshes
  collapse into one.
- `vercel.json` schedules `/api/live/refresh` every 10 minutes, so in production
  the snapshot is normally fresh before anyone notices.
- The agents index shows `Availability checked N minutes ago`, and says so when
  the data is more than six hours old.

Manual refresh:

```bash
npm run dev
npm run refresh:live
```

## Adding supply

Add an entry to `src/lib/live/roster.ts` with the onchain agent id, its
category, and the seller's own `serviceId`. Everything else (name, description,
skills, price, availability) is read from the agent itself. Nothing bespoke is
needed per agent: the common adapter covers A2A and MCP.

## Receipts: the filesystem is a cache, the chain is the record

Receipts are written to `data/receipts`, which on a serverless host is
per-instance and does not survive a redeploy. So it is treated as a cache and
never as the system of record.

The durable half is the chain. A paid hire's job description carries the agent,
the buyer and the request; the kernel carries the status, budget, provider and
deliverable digest. `readReceipt` serves the stored copy when it exists and
rebuilds from chain when it does not, so an instance that has never seen a job
still answers for it. `listReceipts` merges both, preferring the stored copy
because it still holds the delivered payload.

What cannot be rebuilt is the payload itself: only its digest is on chain. A
reconstructed receipt says so plainly rather than pretending the work is lost or
that it still has it.

Free hires have no chain anchor by definition, so they live only in the store.
That is stated on the receipt.

`e2e/receipt-durability.spec.ts` asserts all of this against a running
deployment: a cold request, a brand-new browser context with no cookies or
local storage, and a wallet whose device has never been used before.

## Tests never spend money

The journey suite prefers a free agent, because a paid hire escrows real value
on mainnet and a test run must not cost anything. Set `E2E_ALLOW_PAID=1` to
deliberately exercise a paid hire.

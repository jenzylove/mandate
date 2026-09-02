# Architecture decisions

## Stack
- Next.js 14 (App Router) + TypeScript
- Tailwind for styling
- wagmi + viem for BNB Smart Chain wallet connection
- Vitest for unit tests

## Data
- Seeded JSON behind a `DataAdapter` interface. A live agent-inventory source
  (e.g. an ERC-8004 / 8004scan API) can be swapped in later by implementing the
  same interface, without touching the UI or engine.

## Recommendation engine
- Deterministic and inspectable (PRD §22). No LLM in the core consumer flow.
- Produces Safe / Balanced / Aggressive setups and a transparent Fit Score
  with exposed reasons (PRD §14).

## Data provenance
- Every evidence record carries a `provenance` field: `live | historical |
  demo | unavailable`. The UI must distinguish these; demo data is labeled.

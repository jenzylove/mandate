# Mandate audit architecture note

## Current path

Mandate opens a paid ERC-8183 job through the existing `EvaluatorRouter`, registering the deployed policy as the job policy. The provider is named on the job and submits its deliverable to the commerce kernel. The current application then records the payload and calls `EvaluatorRouter.settle(jobId, "0x")` after the policy dispute window. The job's evaluator address is already present in the kernel job record; the application does not currently use it to inspect the deliverable.

## Authority

The provider can submit. The registered policy controls the dispute window and exposes `dispute(jobId)`. The evaluator/router path is the completion authority: settlement is only attempted for a submitted job after the policy window, and the router emits completion. Mandate's new audit is therefore an application-level gate before settlement, not a second escrow or a replacement state machine.

## Smallest safe change

1. Add a deterministic, category-specific audit service that accepts the original request, the submitted payload, and the selected category.
2. Persist `{status, checks, evidence, auditedAt, auditor}` on the receipt. `status` is exactly `passed`, `failed`, or `inconclusive`.
3. Run it after on-chain submission is observed and before a receipt is treated as settled.
4. On `passed`, preserve the existing settle call. On `failed`, call the existing policy dispute method and leave the job rejected/under dispute according to the deployed policy. On `inconclusive`, do not call settle and surface “needs review”.
5. For an outcome with multiple jobs, aggregate receipts by `outcomeId`; the outcome is verified only when every required job has a passing audit.

No new escrow, token, evaluator contract, or LLM scoring is introduced. External protocol reads can be added behind category-specific evidence adapters later; until then, missing independent evidence is explicitly `inconclusive`, never a pass.

## Rule boundary

Health-factor audits verify wallet/network identity, requested versus reported values, and freshness. Rebalancing audits verify token identity, legs, arithmetic, and resulting weights. Yield audits verify protocol/market/asset/APY source and timestamp, but do not assert future returns. Grid audits verify pair, ordered levels, range, limits, spacing, and arithmetic, but do not assert future profitability.

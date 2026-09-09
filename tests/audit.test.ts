import { describe, expect, it } from "vitest";
import { auditSubmission } from "@/lib/audit/mandate-audit";

describe("Mandate deterministic audit", () => {
  it("passes complete structured health-factor work", () => {
    const r = auditSubmission({ category: "health-factor-monitoring", request: "check", submittedHash: "0xabc", content: JSON.stringify({ wallet: "0x1", network: "bsc", healthFactor: 2.1, observedAt: "2026-09-08T00:00:00Z" }) });
    expect(r.status).toBe("passed");
  });
  it("never passes prose or missing evidence", () => {
    expect(auditSubmission({ category: "yield-optimization", request: "yield", submittedHash: "0xabc", content: "looks good" }).status).toBe("inconclusive");
  });
  it("fails explicit errors and unordered grids", () => {
    expect(auditSubmission({ category: "grid-trading", request: "grid", submittedHash: "0xabc", content: JSON.stringify({ error: "cannot price" }) }).status).toBe("failed");
    expect(auditSubmission({ category: "grid-trading", request: "grid", submittedHash: "0xabc", content: JSON.stringify({ pair: "BNB/USDT", levels: [2, 1], lower: 1, upper: 2, spacing: 1 }) }).status).toBe("failed");
  });
});

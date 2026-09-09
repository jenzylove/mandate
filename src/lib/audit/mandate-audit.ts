import type { Category } from "@/lib/domain/types";

export type AuditStatus = "passed" | "failed" | "inconclusive";
export interface AuditCheck { name: string; status: AuditStatus; detail: string }
export interface AuditRecord {
  status: AuditStatus;
  auditor: "mandate-deterministic-v1";
  auditedAt: string;
  category: Category | string;
  checks: AuditCheck[];
  evidence: { request: string; submittedHash: string; fields: string[] };
}
type AnyRecord = Record<string, unknown>;
function objectFrom(text: string): AnyRecord | null {
  try { const p: unknown = JSON.parse(text); if (p && typeof p === "object" && !Array.isArray(p)) return p as AnyRecord; }
  catch { const m = text.match(/\{[\s\S]*\}/); if (m) try { const p: unknown = JSON.parse(m[0]); if (p && typeof p === "object" && !Array.isArray(p)) return p as AnyRecord; } catch { /* inconclusive */ } }
  return null;
}
const present = (v: unknown) => (typeof v === "string" && v.trim().length > 0) || (typeof v === "number" && Number.isFinite(v)) || (Array.isArray(v) && v.length > 0);
function required(o: AnyRecord, fields: string[], label: string): AuditCheck {
  const missing = fields.filter((f) => !present(o[f]));
  return missing.length ? { name: label, status: "inconclusive", detail: `Missing independent fields: ${missing.join(", ")}` } : { name: label, status: "passed", detail: `Submitted ${label.toLowerCase()} fields are present.` };
}
function numbers(o: AnyRecord, fields: string[], label: string): AuditCheck {
  const ok = fields.every((f) => typeof o[f] === "number" && Number.isFinite(o[f]));
  return ok ? { name: label, status: "passed", detail: "Numeric values are finite and machine-checkable." } : { name: label, status: "inconclusive", detail: `Numeric fields unavailable: ${fields.join(", ")}` };
}
export function auditSubmission(input: { category: Category | string; request: string; content: string; submittedHash: string }): AuditRecord {
  const o = objectFrom(input.content); const checks: AuditCheck[] = [];
  if (!o) checks.push({ name: "structured-delivery", status: "inconclusive", detail: "The deliverable is not machine-readable JSON." });
  else {
    checks.push(o.status === "failed" || o.error ? { name: "agent-declared-status", status: "failed", detail: String(o.error ?? "The provider marked this delivery as failed.") } : { name: "agent-declared-status", status: "passed", detail: "The provider returned a non-error structured delivery." });
    switch (input.category) {
      case "health-factor-monitoring": checks.push(required(o, ["wallet", "network", "healthFactor"], "health-factor identity and value"), required(o, ["observedAt"], "freshness timestamp"), numbers(o, ["healthFactor"], "health-factor arithmetic")); break;
      case "rebalancing": checks.push(required(o, ["holdings", "targetWeights", "legs"], "portfolio identity and plan"), numbers(o, ["totalValue"], "portfolio total"), required(o, ["resultingWeights"], "resulting allocation")); break;
      case "yield-optimization": checks.push(required(o, ["protocol", "market", "asset", "apySource", "observedAt"], "yield provenance"), numbers(o, ["apy"], "reported APY")); break;
      case "grid-trading": {
        checks.push(required(o, ["pair", "levels", "lower", "upper", "spacing"], "grid geometry"), numbers(o, ["lower", "upper", "spacing"], "grid arithmetic"));
        if (Array.isArray(o.levels)) { const levels = o.levels.filter((v): v is number => typeof v === "number" && Number.isFinite(v)); checks.push(levels.length === o.levels.length && levels.every((v, i) => i === 0 || v > levels[i - 1]) ? { name: "ordered-levels", status: "passed", detail: "Grid levels are strictly increasing." } : { name: "ordered-levels", status: "failed", detail: "Grid levels are not strictly increasing numeric values." }); }
        break;
      }
      default: checks.push({ name: "category-schema", status: "inconclusive", detail: `No deterministic schema is registered for ${input.category}.` });
    }
  }
  const status: AuditStatus = checks.some((c) => c.status === "failed") ? "failed" : checks.every((c) => c.status === "passed") ? "passed" : "inconclusive";
  return { status, auditor: "mandate-deterministic-v1", auditedAt: new Date().toISOString(), category: input.category, checks, evidence: { request: input.request, submittedHash: input.submittedHash, fields: o ? Object.keys(o) : [] } };
}

import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";

// Outcome detail (PRD §12): goal, roles, proof, risk, activate.
export default async function OutcomeDetail({
  params,
}: {
  params: { id: string };
}) {
  const outcome = await data.getOutcome(params.id);
  if (!outcome) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{outcome.name}</h1>
      <p className="mt-2 text-muted">{outcome.description}</p>

      <h2 className="mt-8 text-lg font-semibold">Agents powering this outcome</h2>
      <ul className="mt-3 space-y-2">
        {outcome.requiredRoles.map((r) => (
          <li key={r.role} className="rounded-md border border-line p-3 text-sm">
            <span className="font-medium">{r.role}</span>
            <span className="text-muted"> · {r.category}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Proof</h2>
      <p className="text-xs text-muted">
        Source: {outcome.evidence.provenance} · window {outcome.evidence.windowDays}d
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {outcome.evidence.metrics.map((m) => (
          <span key={m.label} className="rounded-md bg-line/50 px-2 py-1 text-xs">
            {m.label}: {m.value}
          </span>
        ))}
      </div>

      <div className="mt-8">
        <button className="rounded-md bg-action px-4 py-2 text-sm font-medium text-white">
          Activate
        </button>
      </div>
    </main>
  );
}

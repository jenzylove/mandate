import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";
import { CATEGORY_LABELS } from "@/lib/domain/types";

// Agent detail (PRD §11): what it does, where, evidence, cost, activate.
export default async function AgentDetail({
  params,
}: {
  params: { id: string };
}) {
  const agent = await data.getAgent(params.id);
  if (!agent) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">{CATEGORY_LABELS[agent.category]}</p>
      <h1 className="mt-1 text-2xl font-semibold">{agent.name}</h1>
      <p className="mt-2 text-muted">{agent.description}</p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Protocols</dt>
          <dd>{agent.protocols.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Assets</dt>
          <dd>{agent.assets.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Cost</dt>
          <dd>{agent.pricing}</dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd>{agent.status}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Evidence</h2>
      <p className="text-xs text-muted">Source: {agent.evidence.provenance}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {agent.evidence.metrics.map((m) => (
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

import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { CATEGORY_LABELS } from "@/lib/domain/types";

export default async function AgentsPage() {
  const agents = await data.listAgents();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Agents</h1>
      <p className="mt-2 text-muted">Browse individual BNB Chain agents.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-muted">{CATEGORY_LABELS[a.category]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{a.description}</p>
            <p className="mt-3 text-xs text-muted">
              Reputation {a.reputation} · {a.status}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}

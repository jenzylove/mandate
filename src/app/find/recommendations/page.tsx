import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import type { OutcomeQuery } from "@/lib/domain/types";

// Step 5 (PRD §7.5): runs the deterministic engine against the flagship
// outcome with a demo query, so Safe/Balanced/Aggressive render from real
// engine output. The flow milestone will feed real user selections in.
const demoQuery: OutcomeQuery = {
  goalType: "combine",
  protocol: "Venus",
  asset: "USDT",
  risk: "balanced",
  control: "ask",
  timeframeDays: 30,
};

const MODE_TONE: Record<string, string> = {
  safe: "text-safe",
  balanced: "text-balanced",
  aggressive: "text-aggressive",
};

export default async function Recommendations() {
  const outcome = await data.getOutcome("protect-and-earn");
  const agents = await data.listAgents();
  const recs = outcome ? recommend({ query: demoQuery, outcome, agents }) : [];
  const byId = new Map(agents.map((a) => [a.id, a]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm text-muted">Step 5 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">Recommendations</h1>
      <p className="mt-2 text-muted">
        Three setups for {outcome?.name}. Fit scores and reasons come straight
        from the engine.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {recs.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className={`text-sm font-semibold capitalize ${MODE_TONE[r.mode]}`}>
              {r.mode}
            </div>
            <div className="mt-1 text-3xl font-semibold">{r.fitScore}%</div>
            <p className="text-xs text-muted">fit</p>

            <ul className="mt-3 space-y-1 text-sm">
              {r.agents.map((ra) => (
                <li key={ra.agentId}>
                  <span className="font-medium">{byId.get(ra.agentId)?.name}</span>
                  <span className="text-muted"> · {ra.role}</span>
                </li>
              ))}
            </ul>

            <ul className="mt-3 space-y-1 text-xs text-muted">
              {r.reasons.map((reason) => (
                <li key={reason}>· {reason}</li>
              ))}
            </ul>

            <Link
              href={`/outcomes/${r.outcomeId}`}
              className="mt-4 inline-block rounded-md bg-action px-3 py-1.5 text-sm text-white"
            >
              Activate
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}

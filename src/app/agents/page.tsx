import { data } from "@/lib/data/live-adapter";
import { Catalog } from "@/components/catalog";
import { freshness } from "@/lib/live/snapshot";

// Availability is read live, so this page must not be baked at build time.
export const dynamic = "force-dynamic";
export default async function AgentsPage() {
  const [agents, fresh] = await Promise.all([data.listAgents(), freshness()]);
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">THE AGENT MARKETPLACE</p>
        <h1>Specialists for your next move.</h1>
        <p>
          Meet the agents. Explore what they do, where they work, and what they
          cost. Live listings are read from the onchain registry; seeded examples
          are labelled.
        </p>
        <p className="eyebrow">
          {fresh.label}
          {fresh.veryStale ? " · may be out of date" : ""}
        </p>
      </div>
      <Catalog kind="agents" agents={agents} />
    </main>
  );
}

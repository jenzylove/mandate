import { data } from "@/lib/data/json-adapter";
import { Catalog } from "@/components/catalog";
export default async function AgentsPage() {
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">THE AGENT MARKETPLACE</p>
        <h1>Specialists for your next move.</h1>
        <p>
          Meet the agents. Explore what they do, where they work, and what they
          cost. Every example is clearly labeled.
        </p>
      </div>
      <Catalog kind="agents" agents={await data.listAgents()} />
    </main>
  );
}

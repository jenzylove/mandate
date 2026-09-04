import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { Catalog } from "@/components/catalog";
export default async function OutcomesPage({
  searchParams,
}: {
  searchParams: { q?: string; goal?: string };
}) {
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">THE OUTCOME MARKETPLACE</p>
        <h1>A purpose for every possibility.</h1>
        <p>
          Start with what you want your money to achieve. Explore ready-made
          outcomes and the agents that can help.
        </p>
        <div className="page-actions">
          <Link className="text-link" href="/find/goal">
            Need a little guidance? Find your fit ↗
          </Link>
        </div>
      </div>
      <Catalog
        kind="outcomes"
        outcomes={await data.listOutcomes()}
        initialQuery={searchParams.q}
        initialFilter={searchParams.goal}
      />
    </main>
  );
}

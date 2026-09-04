import { notFound } from "next/navigation";
import { data } from "@/lib/data/live-adapter";
import { Catalog } from "@/components/catalog";
import { categoryNames } from "@/components/market-ui";

// Availability is read live, so this page must not be baked at build time.
export const dynamic = "force-dynamic";
export default async function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  if (!Object.prototype.hasOwnProperty.call(categoryNames, params.category))
    notFound();
  return (
    <main className="shell">
      <div className="page-top">
        <p className="eyebrow">BROWSE AGENTS</p>
        <h1>{categoryNames[params.category]}</h1>
        <p>
          Find a specialist. Compare capabilities, pricing and demo evidence.
        </p>
      </div>
      <Catalog
        kind="agents"
        agents={await data.listAgents()}
        initialFilter={params.category}
      />
    </main>
  );
}

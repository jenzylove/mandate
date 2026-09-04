import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";
import { Catalog } from "@/components/catalog";
import { categoryNames } from "@/components/market-ui";
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

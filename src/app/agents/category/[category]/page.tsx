import Link from "next/link";
import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";
import {
  CATEGORY_LABELS,
  REQUIRED_CATEGORIES,
  type Category,
} from "@/lib/domain/types";

export default async function CategoryPage({
  params,
}: {
  params: { category: string };
}) {
  const category = params.category as Category;
  if (!REQUIRED_CATEGORIES.includes(category)) notFound();

  const agents = await data.listAgentsByCategory(category);
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{CATEGORY_LABELS[category]}</h1>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="rounded-lg border border-line p-4">
            <div className="font-medium">{a.name}</div>
            <p className="mt-1 text-sm text-muted">{a.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

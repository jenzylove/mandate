import Link from "next/link";
import { data } from "@/lib/data/json-adapter";

export default async function OutcomesPage() {
  const outcomes = await data.listOutcomes();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Outcomes</h1>
      <p className="mt-2 text-muted">Ready-made financial objectives.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {outcomes.map((o) => (
          <Link key={o.id} href={`/outcomes/${o.id}`} className="rounded-lg border border-line p-4">
            <div className="font-medium">{o.name}</div>
            <p className="mt-1 text-sm text-muted">{o.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}

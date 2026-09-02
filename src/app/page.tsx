import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { CATEGORY_LABELS, REQUIRED_CATEGORIES } from "@/lib/domain/types";

// Home = the two-entry experience (PRD §6/§19). Data-backed shelves prove the
// adapter wiring; visual treatment is intentionally restrained for now.
export default async function Home() {
  const featured = await data.featuredOutcomes();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <section>
        <p className="text-sm text-muted">BNB Chain outcome marketplace</p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight">
          Start from what you want your money to do.
        </h1>
        <p className="mt-4 max-w-prose text-muted">
          Browse agents if you know what you need. Start from an outcome if you
          do not.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/find/goal"
            className="rounded-md bg-action px-4 py-2 text-sm font-medium text-white"
          >
            I know what I want
          </Link>
          <Link
            href="/outcomes"
            className="rounded-md border border-line px-4 py-2 text-sm font-medium"
          >
            Explore marketplace
          </Link>
          <Link
            href="/build-agent"
            className="px-4 py-2 text-sm text-muted underline underline-offset-4"
          >
            Build your own agent
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-lg font-semibold">Popular outcomes</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {featured.map((o) => (
            <Link
              key={o.id}
              href={`/outcomes/${o.id}`}
              className="rounded-lg border border-line p-4"
            >
              <div className="font-medium">{o.name}</div>
              <p className="mt-1 text-sm text-muted">{o.description}</p>
              <p className="mt-3 text-xs text-muted">
                {o.requiredRoles.length} agent role
                {o.requiredRoles.length > 1 ? "s" : ""} · demo evidence
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-16">
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          {REQUIRED_CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/agents/category/${c}`}
              className="rounded-md border border-line px-3 py-2 text-sm"
            >
              {CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

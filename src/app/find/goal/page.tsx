import Link from "next/link";

const GOALS = [
  ["earn", "Earn"],
  ["trade", "Trade"],
  ["protect", "Protect"],
  ["manage-liquidity", "Manage liquidity"],
  ["combine", "Combine goals"],
] as const;

export default function GoalStep() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">Step 1 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">What should your money do?</h1>
      <div className="mt-6 flex flex-wrap gap-3">
        {GOALS.map(([id, label]) => (
          <Link key={id} href="/find/context" className="rounded-md border border-line px-4 py-2 text-sm">
            {label}
          </Link>
        ))}
      </div>
    </main>
  );
}

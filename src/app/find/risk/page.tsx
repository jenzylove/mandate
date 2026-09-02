import Link from "next/link";
export default function RiskStep() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">Step 3 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">Risk preference</h1>
      <div className="mt-6 flex gap-3">
        {["Conservative", "Balanced", "Aggressive"].map((r) => (
          <Link key={r} href="/find/control" className="rounded-md border border-line px-4 py-2 text-sm">
            {r}
          </Link>
        ))}
      </div>
    </main>
  );
}

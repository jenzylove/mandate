import Link from "next/link";
export default function ContextStep() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">Step 2 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">Context</h1>
      <p className="mt-2 text-muted">Asset, protocol, amount. Prefilled from your wallet where practical.</p>
      <Link href="/find/risk" className="mt-6 inline-block rounded-md bg-ink px-4 py-2 text-sm text-paper">
        Continue
      </Link>
    </main>
  );
}

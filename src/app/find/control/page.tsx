import Link from "next/link";
export default function ControlStep() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">Step 4 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">How much control?</h1>
      <div className="mt-6 flex gap-3">
        {["Monitor only", "Ask before acting", "Autopilot"].map((c) => (
          <Link key={c} href="/find/recommendations" className="rounded-md border border-line px-4 py-2 text-sm">
            {c}
          </Link>
        ))}
      </div>
    </main>
  );
}

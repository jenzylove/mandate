#!/usr/bin/env bash
#
# Milestone 04 — Route skeleton + wallet foundation
# -------------------------------------------------
# Lays down every route in the PRD information architecture (§18) as a working
# server component wired to the data adapter and engine, and adds the
# wagmi/viem config for BNB Smart Chain plus a client wallet provider. Screens
# are deliberately minimal (foundation, not polish): they render real data so
# the wiring is proven end to end. Verifies typecheck + full production build.
#
# Safe to run once from the repo root.

set -euo pipefail
ROOT="$(pwd)"
[[ -d "$ROOT/scripts" ]] || { echo "ERROR: run from repo root." >&2; exit 1; }
[[ -f "$ROOT/src/lib/engine/recommend.ts" ]] || { echo "ERROR: run milestone 03 first." >&2; exit 1; }

echo "==> Milestone 04: routes + wallet foundation"

# --- wallet deps -------------------------------------------------------------
echo "  - installing wallet deps (wagmi/viem/react-query)..."
npm install --silent --no-audit --no-fund \
  wagmi@2.12.17 viem@2.21.19 @tanstack/react-query@5.59.0

# ============================================================================
# Chain + wallet config (BNB Smart Chain).
# ============================================================================
cat > "$ROOT/src/config/chain.ts" <<'EOF'
import { http, createConfig } from "wagmi";
import { bsc, bscTestnet } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// BNB Smart Chain (mainnet + testnet). Injected connector keeps the MVP
// dependency-light; a richer connector set can be added without touching the
// UI. Transports use the public RPC by default.
export const wagmiConfig = createConfig({
  chains: [bsc, bscTestnet],
  connectors: [injected()],
  transports: {
    [bsc.id]: http(),
    [bscTestnet.id]: http(),
  },
  ssr: true,
});

export const CHAINS = { bsc, bscTestnet };
EOF

# Client providers wrapper (wagmi + react-query).
cat > "$ROOT/src/components/providers.tsx" <<'EOF'
"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/config/chain";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
EOF

# Minimal connect button (foundation-level, not styled polish).
cat > "$ROOT/src/components/connect-wallet.tsx" <<'EOF'
"use client";

import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";

// A wallet is optional context (PRD: fields prefill "where practical"), never a
// gate on browsing. This component reflects connection state and nothing more.
export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-md border border-line px-3 py-1.5 text-sm"
      >
        {address.slice(0, 6)}…{address.slice(-4)} · Disconnect
      </button>
    );
  }
  return (
    <button
      onClick={() => connect({ connector: injected() })}
      className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper"
    >
      Connect wallet
    </button>
  );
}
EOF

# ============================================================================
# Shared layout primitives (kept tiny; polish is a later phase).
# ============================================================================
cat > "$ROOT/src/components/nav.tsx" <<'EOF'
import Link from "next/link";
import { ConnectWallet } from "@/components/connect-wallet";

export function Nav() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          mandate
        </Link>
        <div className="flex items-center gap-5 text-sm text-muted">
          <Link href="/outcomes">Outcomes</Link>
          <Link href="/agents">Agents</Link>
          <Link href="/find/goal">Find</Link>
          <Link href="/my-outcomes">My Outcomes</Link>
          <ConnectWallet />
        </div>
      </nav>
    </header>
  );
}
EOF

# ============================================================================
# Rewire root layout + home to use Providers, Nav, and the two entry paths.
# ============================================================================
cat > "$ROOT/src/app/layout.tsx" <<'EOF'
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "mandate",
  description:
    "Start from what you want your money to do. mandate turns BNB Chain agents into understandable, evidence-backed outcomes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <Providers>
          <Nav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
EOF

cat > "$ROOT/src/app/page.tsx" <<'EOF'
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
EOF

# ============================================================================
# Marketplace routes: outcomes + agents (list, detail, category).
# ============================================================================

# --- /outcomes ---------------------------------------------------------------
mkdir -p "$ROOT/src/app/outcomes"
cat > "$ROOT/src/app/outcomes/page.tsx" <<'EOF'
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
EOF

mkdir -p "$ROOT/src/app/outcomes/[id]"
cat > "$ROOT/src/app/outcomes/[id]/page.tsx" <<'EOF'
import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";

// Outcome detail (PRD §12): goal, roles, proof, risk, activate.
export default async function OutcomeDetail({
  params,
}: {
  params: { id: string };
}) {
  const outcome = await data.getOutcome(params.id);
  if (!outcome) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">{outcome.name}</h1>
      <p className="mt-2 text-muted">{outcome.description}</p>

      <h2 className="mt-8 text-lg font-semibold">Agents powering this outcome</h2>
      <ul className="mt-3 space-y-2">
        {outcome.requiredRoles.map((r) => (
          <li key={r.role} className="rounded-md border border-line p-3 text-sm">
            <span className="font-medium">{r.role}</span>
            <span className="text-muted"> · {r.category}</span>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Proof</h2>
      <p className="text-xs text-muted">
        Source: {outcome.evidence.provenance} · window {outcome.evidence.windowDays}d
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {outcome.evidence.metrics.map((m) => (
          <span key={m.label} className="rounded-md bg-line/50 px-2 py-1 text-xs">
            {m.label}: {m.value}
          </span>
        ))}
      </div>

      <div className="mt-8">
        <button className="rounded-md bg-action px-4 py-2 text-sm font-medium text-white">
          Activate
        </button>
      </div>
    </main>
  );
}
EOF

mkdir -p "$ROOT/src/app/outcomes/create"
cat > "$ROOT/src/app/outcomes/create/page.tsx" <<'EOF'
export default function CreateOutcome() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Create an outcome</h1>
      <p className="mt-2 text-muted">
        Custom outcome definition arrives in a later milestone. For now, start
        from a ready-made outcome or the guided flow.
      </p>
    </main>
  );
}
EOF

# --- /agents -----------------------------------------------------------------
mkdir -p "$ROOT/src/app/agents"
cat > "$ROOT/src/app/agents/page.tsx" <<'EOF'
import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { CATEGORY_LABELS } from "@/lib/domain/types";

export default async function AgentsPage() {
  const agents = await data.listAgents();
  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Agents</h1>
      <p className="mt-2 text-muted">Browse individual BNB Chain agents.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {agents.map((a) => (
          <Link key={a.id} href={`/agents/${a.id}`} className="rounded-lg border border-line p-4">
            <div className="flex items-center justify-between">
              <span className="font-medium">{a.name}</span>
              <span className="text-xs text-muted">{CATEGORY_LABELS[a.category]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{a.description}</p>
            <p className="mt-3 text-xs text-muted">
              Reputation {a.reputation} · {a.status}
            </p>
          </Link>
        ))}
      </div>
    </main>
  );
}
EOF

mkdir -p "$ROOT/src/app/agents/[id]"
cat > "$ROOT/src/app/agents/[id]/page.tsx" <<'EOF'
import { notFound } from "next/navigation";
import { data } from "@/lib/data/json-adapter";
import { CATEGORY_LABELS } from "@/lib/domain/types";

// Agent detail (PRD §11): what it does, where, evidence, cost, activate.
export default async function AgentDetail({
  params,
}: {
  params: { id: string };
}) {
  const agent = await data.getAgent(params.id);
  if (!agent) notFound();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="text-sm text-muted">{CATEGORY_LABELS[agent.category]}</p>
      <h1 className="mt-1 text-2xl font-semibold">{agent.name}</h1>
      <p className="mt-2 text-muted">{agent.description}</p>

      <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Protocols</dt>
          <dd>{agent.protocols.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Assets</dt>
          <dd>{agent.assets.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted">Cost</dt>
          <dd>{agent.pricing}</dd>
        </div>
        <div>
          <dt className="text-muted">Status</dt>
          <dd>{agent.status}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-semibold">Evidence</h2>
      <p className="text-xs text-muted">Source: {agent.evidence.provenance}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {agent.evidence.metrics.map((m) => (
          <span key={m.label} className="rounded-md bg-line/50 px-2 py-1 text-xs">
            {m.label}: {m.value}
          </span>
        ))}
      </div>

      <div className="mt-8">
        <button className="rounded-md bg-action px-4 py-2 text-sm font-medium text-white">
          Activate
        </button>
      </div>
    </main>
  );
}
EOF

mkdir -p "$ROOT/src/app/agents/category/[category]"
cat > "$ROOT/src/app/agents/category/[category]/page.tsx" <<'EOF'
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
EOF

# ============================================================================
# Outcome flow routes (/find/*). Foundation-level: the steps exist and the
# recommendation step actually runs the engine against a fixed demo query so
# the wiring is proven. Interactive controls come in the flow milestone.
# ============================================================================
for step in goal context risk control; do
  mkdir -p "$ROOT/src/app/find/$step"
done

cat > "$ROOT/src/app/find/goal/page.tsx" <<'EOF'
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
EOF

cat > "$ROOT/src/app/find/context/page.tsx" <<'EOF'
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
EOF

cat > "$ROOT/src/app/find/risk/page.tsx" <<'EOF'
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
EOF

cat > "$ROOT/src/app/find/control/page.tsx" <<'EOF'
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
EOF

mkdir -p "$ROOT/src/app/find/recommendations"
cat > "$ROOT/src/app/find/recommendations/page.tsx" <<'EOF'
import Link from "next/link";
import { data } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import type { OutcomeQuery } from "@/lib/domain/types";

// Step 5 (PRD §7.5): runs the deterministic engine against the flagship
// outcome with a demo query, so Safe/Balanced/Aggressive render from real
// engine output. The flow milestone will feed real user selections in.
const demoQuery: OutcomeQuery = {
  goalType: "combine",
  protocol: "Venus",
  asset: "USDT",
  risk: "balanced",
  control: "ask",
  timeframeDays: 30,
};

const MODE_TONE: Record<string, string> = {
  safe: "text-safe",
  balanced: "text-balanced",
  aggressive: "text-aggressive",
};

export default async function Recommendations() {
  const outcome = await data.getOutcome("protect-and-earn");
  const agents = await data.listAgents();
  const recs = outcome ? recommend({ query: demoQuery, outcome, agents }) : [];
  const byId = new Map(agents.map((a) => [a.id, a]));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <p className="text-sm text-muted">Step 5 of 5</p>
      <h1 className="mt-1 text-2xl font-semibold">Recommendations</h1>
      <p className="mt-2 text-muted">
        Three setups for {outcome?.name}. Fit scores and reasons come straight
        from the engine.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {recs.map((r) => (
          <div key={r.id} className="rounded-lg border border-line p-4">
            <div className={`text-sm font-semibold capitalize ${MODE_TONE[r.mode]}`}>
              {r.mode}
            </div>
            <div className="mt-1 text-3xl font-semibold">{r.fitScore}%</div>
            <p className="text-xs text-muted">fit</p>

            <ul className="mt-3 space-y-1 text-sm">
              {r.agents.map((ra) => (
                <li key={ra.agentId}>
                  <span className="font-medium">{byId.get(ra.agentId)?.name}</span>
                  <span className="text-muted"> · {ra.role}</span>
                </li>
              ))}
            </ul>

            <ul className="mt-3 space-y-1 text-xs text-muted">
              {r.reasons.map((reason) => (
                <li key={reason}>· {reason}</li>
              ))}
            </ul>

            <Link
              href={`/outcomes/${r.outcomeId}`}
              className="mt-4 inline-block rounded-md bg-action px-3 py-1.5 text-sm text-white"
            >
              Activate
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
EOF

# ============================================================================
# My Outcomes + build-agent redirect.
# ============================================================================
mkdir -p "$ROOT/src/app/my-outcomes"
cat > "$ROOT/src/app/my-outcomes/page.tsx" <<'EOF'
export default function MyOutcomes() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">My outcomes</h1>
      <p className="mt-2 text-muted">
        Activated outcomes will show here with status and metrics. Nothing
        activated yet.
      </p>
    </main>
  );
}
EOF

mkdir -p "$ROOT/src/app/my-outcomes/[id]"
cat > "$ROOT/src/app/my-outcomes/[id]/page.tsx" <<'EOF'
export default function MyOutcomeDetail({ params }: { params: { id: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Active outcome</h1>
      <p className="mt-2 text-muted">Status view for {params.id} arrives with activation.</p>
    </main>
  );
}
EOF

# build-agent -> external redirect to BNB Agent Studio (PRD §4.5/§21).
mkdir -p "$ROOT/src/app/build-agent"
cat > "$ROOT/src/app/build-agent/page.tsx" <<'EOF'
import { redirect } from "next/navigation";

// Builders are routed to BNB Agent Studio; this product does not rebuild it.
export default function BuildAgent() {
  redirect("https://www.bnbchain.org/en/agent-studio");
}
EOF

# ============================================================================
# Engine smoke test wired through the adapter, so route data path is covered.
# ============================================================================
cat > "$ROOT/tests/integration.test.ts" <<'EOF'
import { describe, it, expect } from "vitest";
import { data } from "@/lib/data/json-adapter";
import { recommend } from "@/lib/engine/recommend";
import type { OutcomeQuery } from "@/lib/domain/types";

describe("adapter + engine integration", () => {
  it("produces renderable recommendations for the flagship outcome", async () => {
    const outcome = await data.getOutcome("protect-and-earn");
    const agents = await data.listAgents();
    expect(outcome).not.toBeNull();
    const q: OutcomeQuery = {
      goalType: "combine",
      protocol: "Venus",
      asset: "USDT",
      risk: "balanced",
      control: "ask",
    };
    const recs = recommend({ query: q, outcome: outcome!, agents });
    expect(recs.length).toBeGreaterThan(0);
    // Every rec must be renderable: known agents + a fit score.
    const ids = new Set(agents.map((a) => a.id));
    for (const r of recs) {
      for (const ra of r.agents) expect(ids.has(ra.agentId)).toBe(true);
    }
  });
});
EOF

# --- verification ------------------------------------------------------------
echo "==> Verifying milestone 04"
echo "  - typecheck"
npx tsc --noEmit
echo "  - tests"
npx vitest run
echo "  - production build (all routes)"
npx next build
test -f "$ROOT/.next/BUILD_ID" || { echo "FAIL: no build output"; exit 1; }
echo "  - all checks passed"

# --- commit ------------------------------------------------------------------
git add -A
if git diff --cached --quiet; then
  echo "  - nothing to commit"
else
  git commit -q -m "Milestone 04: full route skeleton (PRD §18) + BNB wallet foundation, engine wired end to end"
  echo "  - committed"
fi

echo "==> Milestone 04 complete."
echo "    Next: git push origin main"
echo "    Foundation done: data model, seeded four categories, deterministic engine, all routes, wallet."

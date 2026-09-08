import { promises as fs } from "node:fs";
import path from "node:path";
import { runMarketSweep } from "@/lib/live/market-sweep";

// The expensive pass, run deliberately and never inside a page request.
//
//   npm run refresh:market
//
// It searches the index broadly, probes what survives the cheap filters, and
// writes the snapshot the marketplace serves from. Hire-time preflight re-checks
// each agent against the chain and its endpoint, so a snapshot going stale
// costs freshness, never correctness.
//
// No paid job is ever created here: quotes and free tool calls only.

const pct = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "-");

async function main() {
  const started = Date.now();
  const out0 = path.join(process.cwd(), "data", "live", "agents.json");

  // Everything already in the snapshot is re-probed regardless of what the
  // index says today, so a market that is known to exist is never dropped
  // merely because discovery could not confirm it again.
  let extraIds: { agentId: string; category: string }[] = [];
  try {
    const prev = JSON.parse(await fs.readFile(out0, "utf8")) as {
      agents?: { live?: { agentId?: string }; category?: string }[];
    };
    extraIds = (prev.agents ?? [])
      .map((a) => ({ agentId: a.live?.agentId ?? "", category: a.category ?? "yield-optimization" }))
      .filter((a) => a.agentId);
  } catch {
    /* first run */
  }
  const result = await runMarketSweep({
    perQuery: Number(process.env.SWEEP_PER_QUERY ?? 200),
    maxProbes: Number(process.env.SWEEP_MAX_PROBES ?? 400),
    concurrency: Number(process.env.SWEEP_CONCURRENCY ?? 6),
    pauseMs: Number(process.env.SWEEP_PAUSE_MS ?? 700),
    registryPages: Number(process.env.SWEEP_REGISTRY_PAGES ?? 40),
    skipDiscovery: process.env.SWEEP_SKIP_DISCOVERY === "1",
    extraIds: extraIds as { agentId: string; category: never }[],
    onProgress: (note) => process.stderr.write(`  ${note}\n`),
  });

  const out = path.join(process.cwd(), "data", "live", "agents.json");
  await fs.mkdir(path.dirname(out), { recursive: true });

  // A sweep is a measurement of a live network and can be wrong about it.
  // Endpoints rate-limit, DNS blips, the index times out. One bad run once
  // replaced a working 22-agent market with an empty one, which is a far worse
  // outcome than a slightly stale snapshot.
  //
  // So a run that finds materially less than the snapshot it would replace is
  // treated as evidence about the run, not about the market, and refuses to
  // write unless explicitly forced.
  let previous: { agents?: unknown[] } = {};
  try {
    previous = JSON.parse(await fs.readFile(out, "utf8"));
  } catch {
    /* first run */
  }
  const had = Array.isArray(previous.agents) ? previous.agents.length : 0;
  const now = result.agents.length;
  const refused = had > 0 && now < had * 0.75 && process.env.SWEEP_FORCE !== "1";
  const forced = process.env.SWEEP_FORCE === "1";

  if (refused) {
    console.error(`
REFUSING TO WRITE
  the existing snapshot holds ${had} qualified agents
  this run qualified only ${now}
  that is a collapse, not a market change: endpoints rate-limit and indexes
  time out, and a stale snapshot beats an empty marketplace.

  the funnel below is still reported, and rejections were written, so the run
  can be inspected. Re-run when the network settles, or set SWEEP_FORCE=1 to
  overwrite deliberately.
`);
  } else {
    const snapshot = {
      refreshedAt: new Date().toISOString(),
      network: "bsc-mainnet",
      funnel: result.funnel,
      agents: result.agents,
    };
    await fs.writeFile(out, JSON.stringify(snapshot, null, 2), "utf8");
  }

  const rejectionsOut = path.join(process.cwd(), "data", "live", "rejections.json");
  await fs.writeFile(rejectionsOut, JSON.stringify(result.rejected, null, 2), "utf8");

  const f = result.funnel;
  console.log(`
QUALIFICATION FUNNEL
────────────────────────────────────────────────────────────
BSC candidates considered        ${f.candidatesConsidered}
  declared a callable protocol   ${f.afterProtocolFilter}  (${pct(f.afterProtocolFilter, f.candidatesConsidered)})
  financially relevant           ${f.afterRelevanceFilter}  (${pct(f.afterRelevanceFilter, f.candidatesConsidered)})
  probed                         ${f.probed}
  endpoint answered              ${f.answering}  (${pct(f.answering, f.probed)})
  paid, with a valid quote       ${f.paidWithQuote}
  free, with proven output       ${f.freeWithOutput}
────────────────────────────────────────────────────────────
PROVEN HIREABLE                  ${f.qualified}
listed but unproven              ${result.agents.length - f.qualified}
total catalogue                  ${result.agents.length}
distinct operators               ${f.distinctOperators}

per category`);
  for (const [c, n] of Object.entries(f.perCategory).sort()) console.log(`  ${c.padEnd(28)} ${n}`);
  console.log("\nrejections by reason");
  for (const [r, n] of Object.entries(f.rejections).sort((a, b) => b[1] - a[1]))
    console.log(`  ${r.padEnd(32)} ${n}`);
  console.log(`\nwrote ${out}`);
  console.log(`wrote ${rejectionsOut} (${result.rejected.length} rows)`);
  console.log(`took ${Math.round((Date.now() - started) / 1000)}s`);
}

main().catch((e) => {
  console.error("sweep failed:", e);
  process.exit(1);
});

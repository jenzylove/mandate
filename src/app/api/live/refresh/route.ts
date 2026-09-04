import { NextResponse } from "next/server";
import { writeSnapshot } from "@/lib/live/snapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Rebuilds the live agent snapshot: resolve every rostered ERC-8004 id from the
// registry, contact each agent, and record what answered. Slow by nature, so it
// runs out of band rather than on a page render.
async function refresh() {
  try {
    const snap = await writeSnapshot();
    return NextResponse.json({
      ok: true,
      refreshedAt: snap.refreshedAt,
      total: snap.agents.length,
      available: snap.agents.filter((a) => a.status === "available").length,
      byCategory: snap.agents.reduce<Record<string, number>>((acc, a) => {
        acc[a.category] = (acc[a.category] ?? 0) + 1;
        return acc;
      }, {}),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

// POST for a manual refresh, GET so a scheduled cron can call it too.
export const POST = refresh;
export const GET = refresh;

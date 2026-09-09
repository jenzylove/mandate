import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/live/snapshot";
import { canonicalizeAgents } from "@/lib/data/live-adapter";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await readSnapshot();
  if (!snap) return NextResponse.json({ ok: false, reason: "no snapshot yet" }, { status: 404 });
  const agents = canonicalizeAgents(snap.agents);
  return NextResponse.json({
    ok: true,
    refreshedAt: snap.refreshedAt,
    network: snap.network,
    funnel: snap.funnel ?? null,
    total: agents.length,
    available: agents.filter((a) => a.status === "available").length,
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      status: a.status,
      pricing: a.pricing,
      transport: a.live.route?.kind,
    })),
  });
}

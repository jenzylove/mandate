import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/live/snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  const snap = await readSnapshot();
  if (!snap) return NextResponse.json({ ok: false, reason: "no snapshot yet" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    refreshedAt: snap.refreshedAt,
    network: snap.network,
    total: snap.agents.length,
    available: snap.agents.filter((a) => a.status === "available").length,
    agents: snap.agents.map((a) => ({
      id: a.id,
      name: a.name,
      category: a.category,
      status: a.status,
      pricing: a.pricing,
      transport: a.live.route?.kind,
    })),
  });
}

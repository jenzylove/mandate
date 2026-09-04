import { NextResponse } from "next/server";
import { hire } from "@/lib/settlement/hire";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      agentId?: string;
      buyer?: string;
      outcomeId?: string;
      request?: string;
      params?: Record<string, unknown>;
      resumeJobId?: string;
    };
    if (!body.agentId) return NextResponse.json({ ok: false, error: "agentId is required" }, { status: 400 });
    const receipt = await hire({
      agentId: body.agentId,
      buyer: body.buyer ?? null,
      outcomeId: body.outcomeId,
      request: body.request,
      params: body.params,
      resumeJobId: body.resumeJobId,
    });
    return NextResponse.json({ ok: true, receipt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

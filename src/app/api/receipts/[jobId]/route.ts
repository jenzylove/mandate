import { NextResponse } from "next/server";
import { readReceipt } from "@/lib/settlement/hire";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { jobId: string } }) {
  const receipt = await readReceipt(params.jobId);
  if (!receipt) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, receipt });
}

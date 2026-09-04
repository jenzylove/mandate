import { NextResponse } from "next/server";
import { trySettle } from "@/lib/settlement/hire";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    const receipt = await trySettle(id);
    if (!receipt) return NextResponse.json({ ok: false, error: "no such receipt" }, { status: 404 });
    return NextResponse.json({ ok: true, receipt });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { listReceipts } from "@/lib/settlement/hire";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const buyer = new URL(req.url).searchParams.get("buyer") ?? undefined;
  try {
    return NextResponse.json({ ok: true, receipts: await listReceipts(buyer) });
  } catch (error) {
    // A read-only history request must remain machine-readable even when the
    // optional receipt backend is unavailable. No settlement state is changed.
    return NextResponse.json(
      { ok: false, receipts: [], error: error instanceof Error ? error.message : "Receipt history unavailable" },
      { status: 200 },
    );
  }
}

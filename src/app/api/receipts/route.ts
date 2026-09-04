import { NextResponse } from "next/server";
import { listReceipts } from "@/lib/settlement/hire";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const buyer = new URL(req.url).searchParams.get("buyer") ?? undefined;
  return NextResponse.json({ ok: true, receipts: await listReceipts(buyer) });
}

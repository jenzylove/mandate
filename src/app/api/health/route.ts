import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Also reports which sign-in mode is configured. Tests that drive wagmi's
// injected connector directly need to know whether the Sign in button opens
// Privy instead, so they can skip rather than assert against the wrong door.
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "mandate",
    signIn: process.env.NEXT_PUBLIC_PRIVY_APP_ID ? "privy" : "wallet-only",
  });
}

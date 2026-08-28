import { NextRequest, NextResponse } from "next/server";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";
import { finalizePendingCashouts } from "@/lib/cashout/cashout";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorizeCron(request: NextRequest): boolean {
  const secret = getHolderRewardsCronSecret();
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("key") ?? "";
  return bearer === secret || headerSecret === secret || querySecret === secret;
}

/** Cron / secret: pay SOL for cashouts stuck after verified $BUX transfer. */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await finalizePendingCashouts();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finalize failed";
    console.error("[cashout/finalize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

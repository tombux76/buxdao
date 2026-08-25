import { NextRequest, NextResponse } from "next/server";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";
import { probeHeliusApiKeys } from "@/lib/helius-rpc";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

/**
 * Diagnose which Helius env slots work on this deployment.
 * Returns slot names + last-4 suffix only — never the full API key.
 *
 *   curl -s "https://www.buxdao.com/api/helius/key-health?key=$HOLDER_REWARDS_CRON_SECRET"
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const keys = await probeHeliusApiKeys();
  return NextResponse.json({
    ok: keys.some((k) => k.ok),
    keyCount: keys.length,
    working: keys.filter((k) => k.ok).length,
    keys,
  });
}

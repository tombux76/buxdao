import { NextRequest, NextResponse } from "next/server";
import { refreshHowRareCache } from "@/lib/discord/howrare";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";

export const dynamic = "force-dynamic";
/** fckedcatz only_rarity alone is ~40s; three collections need headroom. */
export const maxDuration = 300;

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
 * Refresh HowRare.is rarity ranks into Postgres for Discord `/rank` and `/nft`.
 * Cold HowRare fetches for Fcked Catz take ~40s — Discord must read from DB.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const collectionId = request.nextUrl.searchParams.get("collection") ?? undefined;

  try {
    const results = await refreshHowRareCache(collectionId || undefined);
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("[howrare-sync]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "HowRare sync failed" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { collectionConfigs } from "@/content/site";
import { buildRawHolders } from "@/lib/bux/helius-holders";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";

export const dynamic = "force-dynamic";
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
 * Warm / refresh nft_holder_snapshots via live DAS scans.
 * Used as a Vercel cron so leaderboards keep last-good counts when DAS flakes.
 */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const holders = await buildRawHolders();
    const withNfts = holders.filter((h) => h.totalNfts > 0).length;
    const byCollection = Object.fromEntries(
      collectionConfigs.map((c) => [
        c.id,
        holders.reduce((sum, h) => sum + (h.nftCounts[c.id] ?? 0), 0),
      ]),
    );
    return NextResponse.json({
      ok: true,
      wallets: holders.length,
      walletsWithNfts: withNfts,
      nftTotals: byCollection,
    });
  } catch (error) {
    console.error("[refresh-nft-snapshots]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Refresh failed" },
      { status: 500 },
    );
  }
}

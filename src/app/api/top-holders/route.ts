import { NextRequest, NextResponse } from "next/server";
import { fetchTopHolders } from "@/lib/bux/top-holders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") || "bux,nfts";
  const collection = request.nextUrl.searchParams.get("collection") || "all";

  const result = await fetchTopHolders(type, collection);

  if (!result) {
    return NextResponse.json(
      { error: "Holders data unavailable. Check HELIUS_API_KEY and GRAVEMARKET_API_KEY." },
      { status: 503 },
    );
  }

  return NextResponse.json(result, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}

import { NextResponse } from "next/server";
import { fetchTokenMetrics } from "@/lib/bux/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await fetchTokenMetrics();

  if (!metrics) {
    return NextResponse.json(
      { error: "Token metrics unavailable. Check HELIUS_API_KEY and RPC config." },
      { status: 503 },
    );
  }

  return NextResponse.json(metrics, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}

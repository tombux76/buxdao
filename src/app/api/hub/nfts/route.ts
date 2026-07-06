import { NextRequest, NextResponse } from "next/server";
import { fetchHubWalletHoldings } from "@/lib/hub/wallet-nfts";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import { hasHeliusApiKey } from "@/lib/helius-rpc";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const wallet = request.nextUrl.searchParams.get("wallet")?.trim();
  if (!wallet || wallet.length < 32) {
    return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
  }

  if (!hasHeliusApiKey()) {
    return NextResponse.json({ error: "Helius not configured" }, { status: 503 });
  }

  try {
    const [holdings, metrics] = await Promise.all([
      fetchHubWalletHoldings(wallet),
      fetchTokenMetrics(),
    ]);

    const tokenValue = metrics?.tokenValue ?? 0;
    const solPrice = metrics?.solPrice ?? 0;
    const cashoutSol = holdings.buxBalance * tokenValue;
    const cashoutUsd = cashoutSol * solPrice;

    return NextResponse.json({
      ...holdings,
      cashoutSol,
      cashoutUsd,
      tokenValue,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}

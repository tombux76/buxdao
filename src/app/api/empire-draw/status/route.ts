import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  buildEligiblePool,
  getPrizeDrawUserChecklist,
  listPastWinners,
  type PrizeDrawUserChecklist,
  type PrizeDrawWinnerRow,
} from "@/lib/prize-draw/eligibility";
import {
  fetchEmpireTokenImage,
  fetchEmpireUsdPrice,
  getPrizeUsdValue,
} from "@/lib/prize-draw/empire-token";
import { PRIZE_EMPIRE_AMOUNT, PRIZE_WALLET } from "@/lib/prize-draw/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function safe<T>(promise: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    console.error(`[prize-draw/status] ${label} failed:`, error);
    return fallback;
  }
}

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const [pool, pastWinners, empireUsdPrice, prizeUsdValue, tokenImageUrl] = await Promise.all([
    safe(buildEligiblePool(), [], "buildEligiblePool"),
    safe<PrizeDrawWinnerRow[]>(listPastWinners(), [], "listPastWinners"),
    safe(fetchEmpireUsdPrice(), null, "fetchEmpireUsdPrice"),
    safe(getPrizeUsdValue(), null, "getPrizeUsdValue"),
    safe(fetchEmpireTokenImage(), null, "fetchEmpireTokenImage"),
  ]);

  let checklist: PrizeDrawUserChecklist | null = null;

  if (userId) {
    checklist = await safe<PrizeDrawUserChecklist | null>(
      getPrizeDrawUserChecklist(userId),
      null,
      "getPrizeDrawUserChecklist",
    );
  }

  return NextResponse.json({
    prizeAmount: PRIZE_EMPIRE_AMOUNT,
    prizeUsdValue,
    empireUsdPrice,
    tokenImageUrl,
    eligiblePoolSize: pool.length,
    prizeWallet: PRIZE_WALLET,
    pastWinners,
    checklist,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { runDailyAccrual } from "@/lib/holder-rewards/accrual";
import { getHolderRewardsCronSecret, isHolderRewardsEnabled } from "@/lib/holder-rewards/config";
import { getRewardDateEt } from "@/lib/holder-rewards/dates";

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
  return bearer === secret || headerSecret === secret;
}

export async function POST(request: NextRequest) {
  if (!isHolderRewardsEnabled()) {
    return NextResponse.json({ error: "Holder rewards are not enabled" }, { status: 404 });
  }

  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { rewardDateEt?: string };
    const rewardDateEt = body.rewardDateEt?.trim() || getRewardDateEt();
    const result = await runDailyAccrual(rewardDateEt);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Accrual failed";
    console.error("Holder rewards accrual error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

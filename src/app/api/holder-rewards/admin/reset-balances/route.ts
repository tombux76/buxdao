import { NextRequest, NextResponse } from "next/server";
import { resetAllRewardBalances } from "@/lib/holder-rewards/accounts";
import { getHolderRewardsCronSecret, isHolderRewardsEnabled } from "@/lib/holder-rewards/config";

export const dynamic = "force-dynamic";

function authorizeAdmin(request: NextRequest): boolean {
  const secret = getHolderRewardsCronSecret();
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  return bearer === secret || headerSecret === secret;
}

/** Zero all unclaimed balances — run once at production go-live. */
export async function POST(request: NextRequest) {
  if (!isHolderRewardsEnabled()) {
    return NextResponse.json({ error: "Holder rewards are not enabled" }, { status: 404 });
  }

  if (!authorizeAdmin(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const updated = await resetAllRewardBalances();
  return NextResponse.json({ ok: true, accountsReset: updated });
}

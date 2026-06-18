import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isHolderRewardsEnabled } from "@/lib/holder-rewards/config";
import { getHolderRewardState } from "@/lib/holder-rewards/state";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!isHolderRewardsEnabled()) {
    return NextResponse.json({ error: "Holder rewards are not enabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getHolderRewardState(session.user.id);
  return NextResponse.json(state);
}

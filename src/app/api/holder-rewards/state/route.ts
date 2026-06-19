import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getClaimRewardState } from "@/lib/holder-rewards/state";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getClaimRewardState(session.user.id);
  return NextResponse.json(state);
}

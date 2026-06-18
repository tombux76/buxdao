import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmHolderRewardClaim } from "@/lib/holder-rewards/claim";
import { isHolderRewardsEnabled } from "@/lib/holder-rewards/config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isHolderRewardsEnabled()) {
    return NextResponse.json({ error: "Holder rewards are not enabled" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    signature?: string;
  };
  const payoutWallet = body.payoutWallet?.trim();
  const signature = body.signature?.trim();
  if (!payoutWallet || !signature) {
    return NextResponse.json({ error: "payoutWallet and signature required" }, { status: 400 });
  }

  try {
    const result = await confirmHolderRewardClaim({
      userId: session.user.id,
      payoutWallet,
      signature,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm claim";
    const status = message.includes("still processing") ? 202 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

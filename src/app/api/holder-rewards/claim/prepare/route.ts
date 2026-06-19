import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prepareHolderRewardClaim } from "@/lib/holder-rewards/claim";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { payoutWallet?: string };
  const payoutWallet = body.payoutWallet?.trim();
  if (!payoutWallet) {
    return NextResponse.json({ error: "payoutWallet required" }, { status: 400 });
  }

  try {
    const result = await prepareHolderRewardClaim({
      userId: session.user.id,
      payoutWallet,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare claim";
    const status = message.includes("in progress") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

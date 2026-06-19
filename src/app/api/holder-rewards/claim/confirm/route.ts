import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmHolderRewardClaim } from "@/lib/holder-rewards/claim";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    feeSignature?: string;
    signature?: string;
  };
  const payoutWallet = body.payoutWallet?.trim();
  const feeSignature = (body.feeSignature ?? body.signature)?.trim();
  if (!payoutWallet || !feeSignature) {
    return NextResponse.json({ error: "payoutWallet and feeSignature required" }, { status: 400 });
  }

  try {
    const result = await confirmHolderRewardClaim({
      userId: session.user.id,
      payoutWallet,
      feeSignature,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm claim";
    const status = message.includes("still processing") || message.includes("not found yet") ? 202 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

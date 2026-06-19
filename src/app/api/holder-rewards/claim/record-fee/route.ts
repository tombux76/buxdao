import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordPendingClaimFee } from "@/lib/holder-rewards/claim";

export const dynamic = "force-dynamic";

/** Persist fee tx immediately so refresh cannot prompt a second SOL payment. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    feeSignature?: string;
  };
  const payoutWallet = body.payoutWallet?.trim();
  const feeSignature = body.feeSignature?.trim();
  if (!payoutWallet || !feeSignature) {
    return NextResponse.json({ error: "payoutWallet and feeSignature required" }, { status: 400 });
  }

  try {
    await recordPendingClaimFee({
      userId: session.user.id,
      payoutWallet,
      feeSignature,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to record fee";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

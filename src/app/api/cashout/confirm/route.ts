import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmCashout } from "@/lib/cashout/cashout";
import { assertCashoutRateLimit } from "@/lib/cashout/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    buxTxSignature?: string;
  };

  const payoutWallet = body.payoutWallet?.trim();
  const buxTxSignature = body.buxTxSignature?.trim();

  if (!payoutWallet || !buxTxSignature) {
    return NextResponse.json({ error: "payoutWallet and buxTxSignature required" }, { status: 400 });
  }

  try {
    await assertCashoutRateLimit(session.user.id, "confirm");
    const result = await confirmCashout({
      userId: session.user.id,
      payoutWallet,
      buxTxSignature,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete cashout";
    const status = message.includes("Too many cashout requests")
      ? 429
      : message.includes("already in progress") || message.includes("confirm again")
        ? 202
        : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

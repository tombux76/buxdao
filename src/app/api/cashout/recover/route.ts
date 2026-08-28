import { NextRequest, NextResponse } from "next/server";
import { confirmCashout } from "@/lib/cashout/cashout";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorizeCron(request: NextRequest): boolean {
  const secret = getHolderRewardsCronSecret();
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("key") ?? "";
  return bearer === secret || headerSecret === secret || querySecret === secret;
}

/**
 * Ops recovery: complete SOL payout after $BUX already landed on-chain.
 * Body: { userId, payoutWallet, buxTxSignature }
 */
export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    userId?: string;
    payoutWallet?: string;
    buxTxSignature?: string;
  };

  const userId = body.userId?.trim();
  const payoutWallet = body.payoutWallet?.trim();
  const buxTxSignature = body.buxTxSignature?.trim();

  if (!userId || !payoutWallet || !buxTxSignature) {
    return NextResponse.json(
      { error: "userId, payoutWallet, and buxTxSignature required" },
      { status: 400 },
    );
  }

  try {
    const result = await confirmCashout({ userId, payoutWallet, buxTxSignature });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Recovery failed";
    console.error("[cashout/recover]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

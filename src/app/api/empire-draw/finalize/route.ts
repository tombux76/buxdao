import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";
import { finalizePendingPrizeDraws } from "@/lib/prize-draw/draw";
import { PRIZE_WALLET } from "@/lib/prize-draw/config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

async function runFinalize() {
  const result = await finalizePendingPrizeDraws();
  return NextResponse.json({
    ok: true,
    finalized: result.finalized.length,
    skipped: result.skipped,
    draws: result.finalized.map((draw) => ({
      drawId: draw.drawId,
      winner: draw.winner.discordUsername,
      txSignature: draw.txSignature,
    })),
  });
}

/** Cron / secret: auto-finalize stuck pending draws after on-chain payout. */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return await runFinalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finalize failed";
    console.error("[empire-draw/finalize]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** Prize-wallet operator: finalize any stuck pending draw for this week. */
export async function POST(request: NextRequest) {
  if (authorizeCron(request)) {
    try {
      return await runFinalize();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Finalize failed";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { walletAddress?: string };
  if (body.walletAddress?.trim() !== PRIZE_WALLET) {
    return NextResponse.json({ error: "Connect the prize wallet" }, { status: 403 });
  }

  try {
    return await runFinalize();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finalize failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

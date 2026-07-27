import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { confirmPrizeDraw } from "@/lib/prize-draw/draw";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    walletAddress?: string;
    txSignature?: string;
  };
  const walletAddress = body.walletAddress?.trim();
  const txSignature = body.txSignature?.trim();

  if (!walletAddress || !txSignature) {
    return NextResponse.json({ error: "walletAddress and txSignature required" }, { status: 400 });
  }

  try {
    const result = await confirmPrizeDraw({
      userId: session.user.id,
      walletAddress,
      txSignature,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to confirm draw";
    const status = message.includes("prize wallet") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

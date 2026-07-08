import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { preparePrizeDraw } from "@/lib/prize-draw/draw";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { walletAddress?: string };
  const walletAddress = body.walletAddress?.trim();
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
  }

  try {
    const result = await preparePrizeDraw({ userId: session.user.id, walletAddress });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare draw";
    const status = message.includes("prize wallet") ? 403 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

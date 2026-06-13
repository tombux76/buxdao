import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createWalletLinkChallenge } from "@/lib/hub/wallet-link";

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
    const challenge = await createWalletLinkChallenge(session.user.id, walletAddress);
    return NextResponse.json(challenge);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create challenge";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

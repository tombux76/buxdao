import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { listLinkedWallets, unlinkWallet } from "@/lib/hub/wallet-link";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wallets = await listLinkedWallets(session.user.id);
  return NextResponse.json({ wallets });
}

export async function DELETE(request: NextRequest) {
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
    await unlinkWallet(session.user.id, walletAddress);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to unlink wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

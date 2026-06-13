import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { linkWalletToUser } from "@/lib/hub/wallet-link";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    walletAddress?: string;
    nonce?: string;
    signature?: string;
    message?: string;
  };

  const walletAddress = body.walletAddress?.trim();
  const nonce = body.nonce?.trim();
  const signature = body.signature?.trim();
  const message = body.message?.trim();

  if (!walletAddress || !nonce || !signature || !message) {
    return NextResponse.json(
      { error: "walletAddress, nonce, signature, and message required" },
      { status: 400 },
    );
  }

  try {
    const wallet = await linkWalletToUser(session.user.id, walletAddress, nonce, signature, message);
    return NextResponse.json({ wallet });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to link wallet";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prepareCashout } from "@/lib/cashout/cashout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    amountBux?: number;
  };

  const payoutWallet = body.payoutWallet?.trim();
  const amountBux = body.amountBux;

  if (!payoutWallet) {
    return NextResponse.json({ error: "payoutWallet required" }, { status: 400 });
  }
  if (typeof amountBux !== "number" || !Number.isFinite(amountBux) || amountBux <= 0) {
    return NextResponse.json({ error: "amountBux must be a positive number" }, { status: 400 });
  }

  try {
    const result = await prepareCashout({
      userId: session.user.id,
      payoutWallet,
      amountBux,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to prepare cashout";
    const status = message.includes("in progress") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

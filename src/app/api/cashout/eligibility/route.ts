import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCashoutEligibility } from "@/lib/cashout/eligibility";
import { assertCashoutRateLimit } from "@/lib/cashout/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payoutWallet = request.nextUrl.searchParams.get("wallet")?.trim();
  if (!payoutWallet) {
    return NextResponse.json({ error: "wallet query param required" }, { status: 400 });
  }

  try {
    await assertCashoutRateLimit(session.user.id, "eligibility");
    const eligibility = await getCashoutEligibility({
      userId: session.user.id,
      payoutWallet,
    });
    return NextResponse.json(eligibility);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load cashout eligibility";
    const status = message.includes("Too many cashout requests") ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

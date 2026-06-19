import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cancelPendingClaim } from "@/lib/holder-rewards/claim";

export const dynamic = "force-dynamic";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await cancelPendingClaim(session.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to cancel claim";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

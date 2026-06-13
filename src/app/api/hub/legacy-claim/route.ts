import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { executeLegacyClaim, getLegacyClaimState } from "@/lib/hub/legacy-claim";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const state = await getLegacyClaimState(session.user.id);
  return NextResponse.json(state);
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await executeLegacyClaim(session.user.id);
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

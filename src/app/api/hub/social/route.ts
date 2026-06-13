import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { twitterLinkEnabled } from "@/lib/auth/config";
import { getLinkedTwitter, unlinkTwitter } from "@/lib/hub/linked-social";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const twitter = await getLinkedTwitter(session.user.id);
  return NextResponse.json({ twitterEnabled: twitterLinkEnabled, twitter });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await unlinkTwitter(session.user.id);
  return NextResponse.json({ ok: true });
}

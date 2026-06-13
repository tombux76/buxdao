import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { twitterLinkEnabled } from "@/lib/auth/config";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";
import { getLinkedTwitter, unlinkTwitter } from "@/lib/hub/linked-social";
import { syncUserSocialProfiles } from "@/lib/hub/sync-profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await syncUserSocialProfiles(session.user.id);

  const [discord, twitter] = await Promise.all([
    getLinkedDiscord(session.user.id),
    getLinkedTwitter(session.user.id),
  ]);

  return NextResponse.json({ discord, twitterEnabled: twitterLinkEnabled, twitter });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await unlinkTwitter(session.user.id);
  return NextResponse.json({ ok: true });
}

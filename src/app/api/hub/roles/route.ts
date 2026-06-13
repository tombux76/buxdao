import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDiscordRolesForUser } from "@/lib/hub/discord-roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roles = await getDiscordRolesForUser(session.user.id);
  return NextResponse.json({ roles });
}

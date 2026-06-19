import { NextRequest, NextResponse } from "next/server";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";
import { syncDiscordEngagementRewards } from "@/lib/holder-rewards/discord-engagement-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorizeCron(request: NextRequest): boolean {
  const secret = getHolderRewardsCronSecret();
  if (!secret) {
    return false;
  }
  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") ?? "";
  const querySecret = request.nextUrl.searchParams.get("key") ?? "";
  return bearer === secret || headerSecret === secret || querySecret === secret;
}

async function runSync() {
  const result = await syncDiscordEngagementRewards();
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("[discord-engagement-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runSync();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("[discord-engagement-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getHolderRewardsCronSecret } from "@/lib/holder-rewards/config";
import { syncOrbisActivity } from "@/lib/nft-activity/orbis-sync";

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

async function runSync(request: NextRequest) {
  const lookbackHoursRaw = request.nextUrl.searchParams.get("lookbackHours");
  const lookbackHours = lookbackHoursRaw ? Number.parseFloat(lookbackHoursRaw) : NaN;
  const lookbackMs =
    Number.isFinite(lookbackHours) && lookbackHours > 0
      ? Math.min(lookbackHours, 168) * 60 * 60 * 1000
      : undefined;

  const result = await syncOrbisActivity({ lookbackMs });
  return NextResponse.json({ ok: true, lookbackMs: lookbackMs ?? null, ...result });
}

export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runSync(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("[orbis-activity-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return await runSync(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";
    console.error("[orbis-activity-sync]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getHeliusWebhookSecret } from "@/lib/nft-activity/config";
import { processHeliusActivityPayload } from "@/lib/nft-activity/process-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyWebhookAuth(request: Request): boolean {
  const secret = getHeliusWebhookSecret();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader === secret || authHeader === `Bearer ${secret}`) {
    return true;
  }

  const customHeader = request.headers.get("x-helius-webhook-secret")?.trim();
  return customHeader === secret;
}

export async function POST(request: Request) {
  if (!verifyWebhookAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processHeliusActivityPayload(payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error("NFT activity webhook failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, service: "nft-activity-webhook" });
}

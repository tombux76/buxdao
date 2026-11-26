import { NextRequest, NextResponse } from "next/server";
import {
  processOrbisWebhookPayload,
  verifyOrbisWebhookSignature,
} from "@/lib/nft-activity/process-orbis-webhook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ ok: true, service: "orbis-activity-webhook" });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature =
    request.headers.get("x-orbis-signature") ?? request.headers.get("X-Orbis-Signature");

  if (!verifyOrbisWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await processOrbisWebhookPayload(
      body as Parameters<typeof processOrbisWebhookPayload>[0],
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    console.error("[orbis-activity-webhook]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

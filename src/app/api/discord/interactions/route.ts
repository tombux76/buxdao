import type { NextRequest } from "next/server";
import { handleDiscordInteractionPost } from "@/lib/discord/interactions-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  return handleDiscordInteractionPost(request);
}

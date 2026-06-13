import type { NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";

const HANDLER = "save-game.cjs";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  return runCasinoHandler(request, HANDLER, { parseBody: true });
}

export async function OPTIONS(request: NextRequest) {
  return runCasinoHandler(request, HANDLER);
}

import type { NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";

const HANDLER = "game-stats.cjs";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return runCasinoHandler(request, HANDLER);
}

export async function OPTIONS(request: NextRequest) {
  return runCasinoHandler(request, HANDLER);
}

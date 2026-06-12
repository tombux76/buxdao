import type { NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";

const HANDLER = "../../../casino-api/save-game.cjs";

export async function POST(request: NextRequest) {
  return runCasinoHandler(request, HANDLER, { parseBody: true });
}

export async function OPTIONS(request: NextRequest) {
  return runCasinoHandler(request, HANDLER);
}

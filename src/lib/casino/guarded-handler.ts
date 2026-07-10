import type { NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";
import { getWalletFromCasinoBody, requireCasinoPlay } from "@/lib/casino/require-casino-play";

export async function runGuardedCasinoPost(
  request: NextRequest,
  handlerPath: string,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const wallet = getWalletFromCasinoBody(body);
  if (!wallet) {
    return Response.json({ error: "walletAddress required" }, { status: 400 });
  }

  const guard = await requireCasinoPlay(wallet);
  if (!guard.ok) {
    return Response.json({ error: guard.error }, { status: guard.status });
  }

  return runCasinoHandler(request, handlerPath, { body });
}

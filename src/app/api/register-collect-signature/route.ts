import { type NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";
import { runGuardedCasinoPost } from "@/lib/casino/guarded-handler";

const HANDLER = "../../../casino-api/register-collect-signature.cjs";

export async function POST(request: NextRequest) {
  return runGuardedCasinoPost(request, HANDLER);
}

export async function OPTIONS(request: NextRequest) {
  return runCasinoHandler(request, HANDLER);
}

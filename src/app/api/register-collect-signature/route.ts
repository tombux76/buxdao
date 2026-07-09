import { type NextRequest } from "next/server";
import { runCasinoHandler } from "@/lib/casino/node-handler";

const HANDLER = "../../../casino-api/register-collect-signature.cjs";

export async function POST(request: NextRequest) {
  return runCasinoHandler(request, HANDLER, { parseBody: true });
}

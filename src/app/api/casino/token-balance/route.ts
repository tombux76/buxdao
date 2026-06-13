import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { fetchCasinoBuxBalance } from "@/lib/casino/bux-balance";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  const balance = await fetchCasinoBuxBalance(wallet);
  return NextResponse.json({ balance });
}

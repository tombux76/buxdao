import { NextResponse } from "next/server";
import { fetchCasinoBuxBalance, isValidSolanaWallet } from "@/lib/casino/bux-balance";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim();
  if (!wallet) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  if (!isValidSolanaWallet(wallet)) {
    return NextResponse.json({ error: "invalid wallet" }, { status: 400 });
  }

  try {
    const balance = await fetchCasinoBuxBalance(wallet);
    return NextResponse.json({ balance });
  } catch (error) {
    console.error("token-balance error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balance", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

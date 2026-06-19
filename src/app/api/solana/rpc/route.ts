import { NextRequest, NextResponse } from "next/server";
import { getServerRpcUrl } from "@/lib/solana/rpc-url";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rpcUrl = getServerRpcUrl();
  const body = await request.text();

  let upstream: Response;
  try {
    upstream = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RPC upstream failed";
    console.error("[solana-rpc-proxy]", message);
    return NextResponse.json({ error: "RPC upstream failed" }, { status: 502 });
  }

  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": "application/json" },
  });
}

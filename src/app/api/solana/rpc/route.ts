import { NextRequest, NextResponse } from "next/server";
import { getServerRpcUrlCandidates } from "@/lib/solana/rpc-url";

export const dynamic = "force-dynamic";

function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/** Browsers and wallets sometimes probe with GET — avoid 405 noise in logs. */
export async function GET() {
  return NextResponse.json({ ok: true, method: "POST" });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const candidates = getServerRpcUrlCandidates();

  if (candidates.length === 0) {
    return NextResponse.json({ error: "RPC not configured" }, { status: 503 });
  }

  let lastError = "RPC upstream failed";

  for (const rpcUrl of candidates) {
    try {
      const upstream = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });

      const text = await upstream.text();
      if (upstream.ok) {
        return new NextResponse(text, {
          status: upstream.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      lastError = `HTTP ${upstream.status}`;
      console.error("[solana-rpc-proxy]", rpcHost(rpcUrl), lastError, text.slice(0, 200));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "RPC upstream failed";
      console.error("[solana-rpc-proxy]", rpcHost(rpcUrl), lastError);
    }
  }

  return NextResponse.json({ error: "RPC upstream failed" }, { status: 502 });
}

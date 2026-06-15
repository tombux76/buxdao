import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPool } from "@/lib/db";
import { authorizeMerchWalletAccess, sanitizeOrderRow } from "@/lib/merch/wallet-auth";

export const dynamic = "force-dynamic";

type ListBody = {
  walletAddress?: string;
  message?: string;
  signature?: string;
};

export async function POST(request: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = (await request.json().catch(() => ({}))) as ListBody;
    const session = await auth();

    const authResult = await authorizeMerchWalletAccess({
      walletAddress: body.walletAddress ?? "",
      message: body.message,
      signature: body.signature,
      userId: session?.user?.id ?? null,
    });

    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const result = await client.query(
      `SELECT id, wallet_address, tx_signature, cart, shipping_info, status, printful_order_id, total_usd, created_at, updated_at
       FROM orders WHERE wallet_address = $1 ORDER BY created_at DESC`,
      [authResult.walletAddress],
    );

    return NextResponse.json({
      success: true,
      orders: result.rows.map((row) => sanitizeOrderRow(row as Record<string, unknown>)),
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}

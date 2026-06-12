import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";

type RouteContext = {
  params: Promise<{ walletAddress: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { walletAddress } = await context.params;
    const result = await client.query(
      `SELECT * FROM orders WHERE wallet_address = $1 ORDER BY created_at DESC`,
      [walletAddress],
    );

    return NextResponse.json({ success: true, orders: result.rows });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}

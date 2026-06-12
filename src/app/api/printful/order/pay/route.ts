import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { verifySolPayment } from "@/lib/solana";

type PayBody = {
  printful_order_id: number;
  txSignature: string;
  wallet_address: string;
};

export async function POST(request: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = (await request.json()) as PayBody;
    const { printful_order_id, txSignature, wallet_address } = body;

    if (!printful_order_id || !txSignature || !wallet_address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const verification = await verifySolPayment(txSignature, wallet_address);
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    await client.query("BEGIN");
    const updateOrder = await client.query(
      `UPDATE orders
       SET status = 'processing', tx_signature = $1, updated_at = NOW()
       WHERE printful_order_id = $2 AND wallet_address = $3
       RETURNING *`,
      [txSignature, printful_order_id, wallet_address],
    );
    await client.query("COMMIT");

    if (updateOrder.rows.length === 0) {
      return NextResponse.json({ error: "Order not found for this payment" }, { status: 400 });
    }

    return NextResponse.json({ success: true, order: updateOrder.rows[0] });
  } catch {
    await client.query("ROLLBACK");
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}

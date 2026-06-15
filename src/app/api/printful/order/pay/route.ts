import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { computeCartTotalUsd, computeExpectedSolLamports, verifySolPayment } from "@/lib/solana";
import { getSolPrice } from "@/lib/sol-price";
import type { CartItem } from "@/lib/merch/types";

type PayBody = {
  printful_order_id: number;
  txSignature: string;
  wallet_address: string;
};

const PAYMENT_TOLERANCE_BPS = 200; // 2% tolerance for SOL price movement

export async function POST(request: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = (await request.json()) as PayBody;
    const { printful_order_id, txSignature, wallet_address } = body;

    if (!printful_order_id || !txSignature || !wallet_address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const existingTx = await client.query(`SELECT id FROM orders WHERE tx_signature = $1`, [txSignature]);
    if (existingTx.rows.length > 0) {
      return NextResponse.json({ error: "Transaction signature already used" }, { status: 400 });
    }

    const orderResult = await client.query(
      `SELECT id, wallet_address, cart, status, total_usd FROM orders
       WHERE printful_order_id = $1 AND wallet_address = $2`,
      [printful_order_id, wallet_address],
    );
    if (orderResult.rows.length === 0) {
      return NextResponse.json({ error: "Order not found for this payment" }, { status: 400 });
    }

    const order = orderResult.rows[0] as {
      id: number;
      wallet_address: string;
      cart: CartItem[] | string;
      status: string;
      total_usd: string | number | null;
    };

    if (order.status !== "pending_payment") {
      return NextResponse.json({ error: "Order is not awaiting payment" }, { status: 400 });
    }

    const cart = typeof order.cart === "string" ? (JSON.parse(order.cart) as CartItem[]) : order.cart;
    const totalUsd =
      order.total_usd != null ? Number(order.total_usd) : computeCartTotalUsd(cart);
    if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
      return NextResponse.json({ error: "Invalid order total" }, { status: 400 });
    }

    const solPrice = await getSolPrice();
    if (solPrice == null) {
      return NextResponse.json({ error: "Could not verify SOL price" }, { status: 503 });
    }

    const expectedLamports = computeExpectedSolLamports(totalUsd, solPrice);
    const minLamports = Math.floor((expectedLamports * (10000 - PAYMENT_TOLERANCE_BPS)) / 10000);
    const maxLamports = Math.ceil((expectedLamports * (10000 + PAYMENT_TOLERANCE_BPS)) / 10000);

    const verification = await verifySolPayment(txSignature, wallet_address, {
      minLamports,
      maxLamports,
    });
    if (!verification.ok) {
      return NextResponse.json({ error: verification.error }, { status: 400 });
    }

    await client.query("BEGIN");
    const updateOrder = await client.query(
      `UPDATE orders
       SET status = 'processing', tx_signature = $1, updated_at = NOW()
       WHERE printful_order_id = $2 AND wallet_address = $3 AND status = 'pending_payment'
       RETURNING *`,
      [txSignature, printful_order_id, wallet_address],
    );
    await client.query("COMMIT");

    if (updateOrder.rows.length === 0) {
      return NextResponse.json({ error: "Order not found for this payment" }, { status: 400 });
    }

    return NextResponse.json({ success: true, order: updateOrder.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message.includes("duplicate key") || message.includes("idx_orders_tx_signature_unique")) {
      return NextResponse.json({ error: "Transaction signature already used" }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}

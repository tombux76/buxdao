import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { createPrintfulOrder, type CartItem, type ShippingInfo } from "@/lib/printful/orders";

type OrderBody = {
  shippingInfo: ShippingInfo;
  cart: CartItem[];
  email: string;
  wallet_address: string;
  skipPayment?: boolean;
};

export async function POST(request: Request) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const body = (await request.json()) as OrderBody;
    const { shippingInfo, cart, email, wallet_address, skipPayment } = body;

    if (!shippingInfo || !cart?.length || !email || !wallet_address) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!skipPayment) {
      return NextResponse.json({ error: "Direct payment flow is not supported" }, { status: 400 });
    }

    const printfulOrder = await createPrintfulOrder(shippingInfo, cart);

    await client.query("BEGIN");
    const dbOrder = await client.query(
      `INSERT INTO orders (wallet_address, cart, shipping_info, status, printful_order_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        wallet_address,
        JSON.stringify(cart),
        JSON.stringify(shippingInfo),
        "pending_payment",
        printfulOrder.id,
      ],
    );
    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      printful_order_id: printfulOrder.id,
      order_id: dbOrder.rows[0].id,
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    client.release();
  }
}

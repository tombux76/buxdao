import { NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { getPrintfulOrder } from "@/lib/printful/client";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { orderId } = await context.params;
    const result = await client.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = result.rows[0] as Record<string, unknown> & { printful_order_id?: number };

    if (order.printful_order_id) {
      try {
        const printfulDetails = (await getPrintfulOrder(String(order.printful_order_id))) as {
          status?: string;
        };
        order.printful_status = printfulDetails.status ?? "unknown";
        order.printful_details = printfulDetails;
      } catch {
        order.printful_status = "unknown";
      }
    }

    return NextResponse.json({ success: true, order });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  } finally {
    client.release();
  }
}

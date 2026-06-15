import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPool } from "@/lib/db";
import { getPrintfulOrder } from "@/lib/printful/client";
import { authorizeMerchWalletAccess, sanitizeOrderRow } from "@/lib/merch/wallet-auth";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

type StatusBody = {
  walletAddress?: string;
  message?: string;
  signature?: string;
};

export async function POST(request: Request, context: RouteContext) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { orderId } = await context.params;
    const id = Number.parseInt(orderId, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as StatusBody;
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
       FROM orders WHERE id = $1 AND wallet_address = $2`,
      [id, authResult.walletAddress],
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = sanitizeOrderRow(result.rows[0] as Record<string, unknown>) as Record<string, unknown> & {
      printful_order_id?: number;
    };

    if (order.printful_order_id) {
      try {
        const printfulDetails = (await getPrintfulOrder(String(order.printful_order_id))) as {
          status?: string;
        };
        order.printful_status = printfulDetails.status ?? "unknown";
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

/** Deprecated unauthenticated lookup. */
export async function GET() {
  return NextResponse.json(
    { error: "Unauthorized. POST with wallet signature or linked Hub session." },
    { status: 401 },
  );
}

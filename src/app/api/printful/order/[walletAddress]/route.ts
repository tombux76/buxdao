import { NextResponse } from "next/server";

/** Deprecated unauthenticated lookup — use POST /api/printful/order/list instead. */
export async function GET() {
  return NextResponse.json(
    { error: "Unauthorized. Use POST /api/printful/order/list with wallet signature." },
    { status: 401 },
  );
}

export async function POST() {
  return NextResponse.json(
    { error: "Use POST /api/printful/order/list with wallet signature." },
    { status: 410 },
  );
}

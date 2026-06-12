import { NextResponse } from "next/server";
import { getSolPrice } from "@/lib/sol-price";

export async function GET() {
  try {
    const solPrice = await getSolPrice();
    if (solPrice == null) {
      return NextResponse.json({ error: "Failed to fetch SOL price" }, { status: 500 });
    }

    return NextResponse.json({
      solPrice,
      timestamp: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch SOL price" }, { status: 500 });
  }
}

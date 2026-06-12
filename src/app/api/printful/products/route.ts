import { NextResponse } from "next/server";
import { listPrintfulProducts } from "@/lib/printful/client";

export async function GET() {
  try {
    const products = await listPrintfulProducts();
    return NextResponse.json(products);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error fetching products from Printful";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

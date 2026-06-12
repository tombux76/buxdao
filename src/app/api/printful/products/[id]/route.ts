import { NextResponse } from "next/server";
import { getPrintfulProduct } from "@/lib/printful/client";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const product = await getPrintfulProduct(id);
    return NextResponse.json(product);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error fetching product from Printful";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

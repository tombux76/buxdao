import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCasinoMyStats } from "@/lib/casino/stats";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Discord login required" }, { status: 401 });
  }

  const wallet = request.nextUrl.searchParams.get("wallet");
  const stats = await getCasinoMyStats(session.user.id, wallet);
  return NextResponse.json(stats);
}

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getPool } from "@/lib/db";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";

export const dynamic = "force-dynamic";

/** Persist fee tx immediately so refresh cannot prompt a second SOL payment. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    payoutWallet?: string;
    feeSignature?: string;
  };
  const payoutWallet = body.payoutWallet?.trim();
  const feeSignature = body.feeSignature?.trim();
  if (!payoutWallet || !feeSignature) {
    return NextResponse.json({ error: "payoutWallet and feeSignature required" }, { status: 400 });
  }

  const linked = await isWalletLinkedToUser(session.user.id, payoutWallet);
  if (!linked) {
    return NextResponse.json({ error: "Wallet not linked" }, { status: 400 });
  }

  const pool = getPool();
  const result = await pool.query(
    `UPDATE holder_reward_pending_claims
     SET fee_tx_signature = $3
     WHERE user_id = $1 AND payout_wallet = $2 AND fee_tx_signature IS NULL
     RETURNING user_id`,
    [session.user.id, payoutWallet, feeSignature],
  );

  if (result.rowCount === 0) {
    const existing = await pool.query<{ fee_tx_signature: string | null }>(
      `SELECT fee_tx_signature FROM holder_reward_pending_claims WHERE user_id = $1`,
      [session.user.id],
    );
    if (!existing.rows[0]) {
      return NextResponse.json({ error: "No pending claim" }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

import { getPool } from "@/lib/db";
import { PENDING_CASHOUT_TTL_MINUTES } from "@/lib/cashout/config";

const MS_PER_MINUTE = 60 * 1000;

export function isPendingExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > PENDING_CASHOUT_TTL_MINUTES * MS_PER_MINUTE;
}

export function assertPendingFresh(createdAt: Date): void {
  if (isPendingExpired(createdAt)) {
    throw new Error("Cashout quote expired — start again from the Hub");
  }
}

export async function deleteExpiredPendingClaims(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `DELETE FROM cashout_pending_claims
     WHERE created_at < NOW() - INTERVAL '${PENDING_CASHOUT_TTL_MINUTES} minutes'`,
  );
}

export async function acquireCashoutLock(params: {
  userId: string;
  payoutWallet: string;
  buxAmountRaw: bigint;
  solGrossLamports: bigint;
  feeLamports: bigint;
  solNetLamports: bigint;
  tokenValueSnapshot: number;
  feeBps: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = getPool();

  await deleteExpiredPendingClaims();

  const existing = await pool.query<{ payout_wallet: string }>(
    `SELECT payout_wallet FROM cashout_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  if (existing.rows[0]) {
    return {
      ok: false,
      error: "Cashout already in progress. Complete it or wait a few minutes.",
    };
  }

  try {
    await pool.query(
      `INSERT INTO cashout_pending_claims (
         user_id, payout_wallet, bux_amount_raw, sol_gross_lamports, fee_lamports,
         sol_net_lamports, token_value_snapshot, fee_bps
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        params.userId,
        params.payoutWallet,
        params.buxAmountRaw.toString(),
        params.solGrossLamports.toString(),
        params.feeLamports.toString(),
        params.solNetLamports.toString(),
        params.tokenValueSnapshot,
        params.feeBps,
      ],
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("23505")) {
      return { ok: false, error: "Cashout already in progress" };
    }
    throw err;
  }
}

export async function releaseCashoutLock(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM cashout_pending_claims WHERE user_id = $1`, [userId]);
}

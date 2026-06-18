import { getPool } from "@/lib/db";

const PENDING_TTL_MINUTES = 15;

export async function acquireClaimLock(
  userId: string,
  payoutWallet: string,
  amountRaw: bigint,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const pool = getPool();

  await pool.query(
    `DELETE FROM holder_reward_pending_claims
     WHERE created_at < NOW() - INTERVAL '${PENDING_TTL_MINUTES} minutes'`,
  );

  const existing = await pool.query<{ amount_raw: string }>(
    `SELECT amount_raw FROM holder_reward_pending_claims WHERE user_id = $1`,
    [userId],
  );
  if (existing.rows[0]) {
    return {
      ok: false,
      error: "Claim already in progress. Complete the pending claim or wait a few minutes.",
    };
  }

  try {
    await pool.query(
      `INSERT INTO holder_reward_pending_claims (user_id, payout_wallet, amount_raw)
       VALUES ($1, $2, $3)`,
      [userId, payoutWallet, amountRaw.toString()],
    );
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("duplicate") || message.includes("23505")) {
      return { ok: false, error: "Claim already in progress" };
    }
    throw err;
  }
}

export async function releaseClaimLock(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM holder_reward_pending_claims WHERE user_id = $1`, [userId]);
}

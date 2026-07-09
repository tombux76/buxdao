import { getPool } from "@/lib/db";

/** Postgres advisory lock — serializes SOL payouts from the liquidity wallet. */
export const CASHOUT_LIQUIDITY_ADVISORY_LOCK_ID = 584_928_763;

export async function withLiquidityPayoutLock<T>(fn: () => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query(`SELECT pg_advisory_lock($1)`, [CASHOUT_LIQUIDITY_ADVISORY_LOCK_ID]);
    return await fn();
  } finally {
    await client.query(`SELECT pg_advisory_unlock($1)`, [CASHOUT_LIQUIDITY_ADVISORY_LOCK_ID]).catch(
      () => undefined,
    );
    client.release();
  }
}

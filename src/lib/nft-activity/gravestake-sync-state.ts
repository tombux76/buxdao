import { getPool } from "@/lib/db";

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;

export async function getLastGravestakeBlockTime(collectionSlug: string): Promise<Date> {
  const pool = getPool();
  const { rows } = await pool.query<{ last_block_time: Date }>(
    `SELECT last_block_time FROM gravestake_activity_sync_state WHERE collection_slug = $1`,
    [collectionSlug],
  );

  if (rows[0]?.last_block_time) {
    return new Date(rows[0].last_block_time);
  }

  return new Date(Date.now() - DEFAULT_LOOKBACK_MS);
}

export async function setLastGravestakeBlockTime(collectionSlug: string, lastBlockTime: Date): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO gravestake_activity_sync_state (collection_slug, last_block_time, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (collection_slug) DO UPDATE
     SET last_block_time = GREATEST(gravestake_activity_sync_state.last_block_time, EXCLUDED.last_block_time),
         updated_at = now()`,
    [collectionSlug, lastBlockTime.toISOString()],
  );
}

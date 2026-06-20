import { getPool } from "@/lib/db";

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;

export async function getLastGravemarketEventTime(collectionSlug: string): Promise<Date> {
  const pool = getPool();
  const { rows } = await pool.query<{ last_event_time: Date }>(
    `SELECT last_event_time FROM gravemarket_activity_sync_state WHERE collection_slug = $1`,
    [collectionSlug],
  );

  if (rows[0]?.last_event_time) {
    return new Date(rows[0].last_event_time);
  }

  return new Date(Date.now() - DEFAULT_LOOKBACK_MS);
}

export async function setLastGravemarketEventTime(
  collectionSlug: string,
  lastEventTime: Date,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO gravemarket_activity_sync_state (collection_slug, last_event_time, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (collection_slug) DO UPDATE
     SET last_event_time = GREATEST(gravemarket_activity_sync_state.last_event_time, EXCLUDED.last_event_time),
         updated_at = now()`,
    [collectionSlug, lastEventTime.toISOString()],
  );
}

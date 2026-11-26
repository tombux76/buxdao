import { getPool } from "@/lib/db";

const DEFAULT_LOOKBACK_MS = 60 * 60 * 1000;

export async function getLastOrbisEventTime(collectionSlug: string): Promise<Date> {
  const pool = getPool();
  const { rows } = await pool.query<{ last_event_time: Date }>(
    `SELECT last_event_time FROM orbis_activity_sync_state WHERE collection_slug = $1`,
    [collectionSlug],
  );

  if (rows[0]?.last_event_time) {
    return new Date(rows[0].last_event_time);
  }

  return new Date(Date.now() - DEFAULT_LOOKBACK_MS);
}

export async function setLastOrbisEventTime(
  collectionSlug: string,
  lastEventTime: Date,
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO orbis_activity_sync_state (collection_slug, last_event_time, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (collection_slug) DO UPDATE
     SET last_event_time = GREATEST(orbis_activity_sync_state.last_event_time, EXCLUDED.last_event_time),
         updated_at = now()`,
    [collectionSlug, lastEventTime.toISOString()],
  );
}

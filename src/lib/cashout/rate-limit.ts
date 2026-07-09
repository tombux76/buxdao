import { getPool } from "@/lib/db";

export type CashoutRateLimitAction = "prepare" | "confirm" | "eligibility";

const LIMITS: Record<CashoutRateLimitAction, { max: number; windowMinutes: number }> = {
  prepare: { max: 20, windowMinutes: 60 },
  confirm: { max: 30, windowMinutes: 5 },
  eligibility: { max: 120, windowMinutes: 5 },
};

export async function assertCashoutRateLimit(
  userId: string,
  action: CashoutRateLimitAction,
): Promise<void> {
  const { max, windowMinutes } = LIMITS[action];
  const pool = getPool();

  await pool.query(
    `DELETE FROM cashout_api_events
     WHERE created_at < NOW() - INTERVAL '24 hours'`,
  );

  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM cashout_api_events
     WHERE user_id = $1
       AND action = $2
       AND created_at > NOW() - ($3::text || ' minutes')::interval`,
    [userId, action, windowMinutes],
  );

  const count = Number.parseInt(rows[0]?.count ?? "0", 10);
  if (count >= max) {
    throw new Error("Too many cashout requests — try again shortly");
  }

  await pool.query(
    `INSERT INTO cashout_api_events (user_id, action) VALUES ($1, $2)`,
    [userId, action],
  );
}

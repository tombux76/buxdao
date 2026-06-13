import { getPool } from "@/lib/db";

export type LinkedTwitter = {
  username: string;
  userId: string;
};

export async function getLinkedTwitter(userId: string): Promise<LinkedTwitter | null> {
  const result = await getPool().query<{ x_username: string | null; x_user_id: string | null }>(
    `SELECT x_username, x_user_id FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row?.x_username || !row?.x_user_id) {
    return null;
  }
  return { username: row.x_username, userId: row.x_user_id };
}

export async function unlinkTwitter(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM accounts WHERE "userId" = $1 AND provider = 'twitter'`, [userId]);
  await pool.query(
    `UPDATE users SET x_username = NULL, x_user_id = NULL, updated_at = now() WHERE id = $1`,
    [userId],
  );
}

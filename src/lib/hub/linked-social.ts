import { getPool } from "@/lib/db";
import { fetchTwitterMe, resolveTwitterLinkProfile } from "@/lib/hub/twitter-profile";

export type LinkedTwitter = {
  username: string;
  userId: string;
  image: string | null;
};

type UserTwitterRow = {
  x_username: string | null;
  x_user_id: string | null;
  x_image: string | null;
};

export async function saveTwitterLink(
  userId: string,
  providerAccountId: string,
  profile: unknown,
  accessToken?: string | null,
): Promise<void> {
  const resolved = await resolveTwitterLinkProfile(profile, accessToken);
  await getPool().query(
    `UPDATE users SET x_username = $1, x_user_id = $2, x_image = $3, updated_at = now() WHERE id = $4`,
    [resolved.username, providerAccountId, resolved.image, userId],
  );
}

export async function syncTwitterProfile(userId: string): Promise<void> {
  const pool = getPool();
  const userResult = await pool.query<UserTwitterRow>(
    `SELECT x_username, x_user_id, x_image FROM users WHERE id = $1`,
    [userId],
  );
  const userRow = userResult.rows[0];
  if (!userRow?.x_user_id) {
    return;
  }
  if (userRow.x_username && userRow.x_image) {
    return;
  }

  const accountResult = await pool.query<{ access_token: string | null }>(
    `SELECT access_token FROM accounts WHERE "userId" = $1 AND provider = 'twitter' LIMIT 1`,
    [userId],
  );
  const accessToken = accountResult.rows[0]?.access_token;
  if (!accessToken) {
    return;
  }

  const fetched = await fetchTwitterMe(accessToken);
  if (!fetched?.username && !fetched?.image) {
    return;
  }

  await pool.query(
    `UPDATE users SET
      x_username = COALESCE($1, x_username),
      x_image = COALESCE($2, x_image),
      updated_at = now()
    WHERE id = $3`,
    [fetched.username, fetched.image, userId],
  );
}

export async function getLinkedTwitter(userId: string): Promise<LinkedTwitter | null> {
  await syncTwitterProfile(userId);

  const result = await getPool().query<UserTwitterRow>(
    `SELECT x_username, x_user_id, x_image FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row?.x_user_id) {
    return null;
  }

  const username = row.x_username ?? row.x_user_id;
  return { username, userId: row.x_user_id, image: row.x_image };
}

export async function unlinkTwitter(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(`DELETE FROM accounts WHERE "userId" = $1 AND provider = 'twitter'`, [userId]);
  await pool.query(
    `UPDATE users SET x_username = NULL, x_user_id = NULL, x_image = NULL, updated_at = now() WHERE id = $1`,
    [userId],
  );
}

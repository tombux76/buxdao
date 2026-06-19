import { getPool } from "@/lib/db";

/** Hub user id for a Discord snowflake, or null if they have never logged into the Hub. */
export async function getHubUserIdByDiscordId(discordId: string): Promise<string | null> {
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT u.id
     FROM users u
     LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
     WHERE u.discord_id = $1 OR a."providerAccountId" = $1
     LIMIT 1`,
    [discordId],
  );
  const id = rows[0]?.id;
  return id != null ? String(id) : null;
}

/** Hub user with at least one linked wallet — required for Discord engagement rewards. */
export async function getEligibleHubUserIdForDiscordEngagement(
  discordId: string,
): Promise<string | null> {
  const { rows } = await getPool().query<{ id: number }>(
    `SELECT u.id
     FROM users u
     LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
     INNER JOIN user_wallets uw ON uw.user_id = u.id
     WHERE u.discord_id = $1 OR a."providerAccountId" = $1
     LIMIT 1`,
    [discordId],
  );
  const id = rows[0]?.id;
  return id != null ? String(id) : null;
}

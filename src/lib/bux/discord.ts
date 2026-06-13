import { getPool } from "@/lib/db";

export async function getWalletDiscordMap(): Promise<{
  walletToDiscord: Map<string, string>;
  discordNames: Map<string, string>;
}> {
  const walletToDiscord = new Map<string, string>();
  const discordNames = new Map<string, string>();

  if (!process.env.POSTGRES_URL) {
    return { walletToDiscord, discordNames };
  }

  try {
    const pool = getPool();
    const walletsRes = await pool.query<{
      wallet_address: string;
      discord_id: string | null;
      discord_username: string | null;
    }>(
      `SELECT
         uw.wallet_address,
         COALESCE(u.discord_id, a."providerAccountId") AS discord_id,
         u.discord_username
       FROM user_wallets uw
       JOIN users u ON u.id = uw.user_id
       LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
       WHERE COALESCE(u.discord_id, a."providerAccountId") IS NOT NULL`,
    );
    for (const row of walletsRes.rows) {
      walletToDiscord.set(row.wallet_address.toLowerCase(), row.discord_id!);
      if (row.discord_username) {
        discordNames.set(row.discord_id!, row.discord_username);
      }
    }
  } catch {
    // Optional — holders still work without Discord tables
  }

  return { walletToDiscord, discordNames };
}

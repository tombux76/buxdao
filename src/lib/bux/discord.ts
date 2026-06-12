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
    const walletsRes = await pool.query<{ wallet_address: string; discord_id: string }>(
      "SELECT wallet_address, discord_id FROM wallets",
    );
    for (const row of walletsRes.rows) {
      walletToDiscord.set(row.wallet_address.toLowerCase(), row.discord_id);
    }

    const discordIds = [...new Set(walletsRes.rows.map((r) => r.discord_id))];
    if (discordIds.length === 0) {
      return { walletToDiscord, discordNames };
    }

    const usersRes = await pool.query<{ discord_id: string; discord_username: string }>(
      "SELECT discord_id, discord_username FROM users WHERE discord_id = ANY($1)",
      [discordIds],
    );
    for (const row of usersRes.rows) {
      if (row.discord_username) {
        discordNames.set(row.discord_id, row.discord_username);
      }
    }
  } catch {
    // Optional — holders still work without Discord tables
  }

  return { walletToDiscord, discordNames };
}

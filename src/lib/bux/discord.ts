import { getPool } from "@/lib/db";

export type UserDiscordInfo = {
  discordId: string | null;
  discordUsername: string | null;
};

export type WalletIdentityMaps = {
  walletToUserId: Map<string, number>;
  userDiscord: Map<number, UserDiscordInfo>;
};

export async function getWalletIdentityMaps(): Promise<WalletIdentityMaps> {
  const walletToUserId = new Map<string, number>();
  const userDiscord = new Map<number, UserDiscordInfo>();

  if (!process.env.POSTGRES_URL) {
    return { walletToUserId, userDiscord };
  }

  try {
    const pool = getPool();
    const walletsRes = await pool.query<{
      wallet_address: string;
      user_id: number;
      discord_id: string | null;
      discord_username: string | null;
    }>(
      `SELECT
         uw.wallet_address,
         uw.user_id,
         COALESCE(u.discord_id, a."providerAccountId") AS discord_id,
         u.discord_username
       FROM user_wallets uw
       JOIN users u ON u.id = uw.user_id
       LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'`,
    );

    for (const row of walletsRes.rows) {
      walletToUserId.set(row.wallet_address.toLowerCase(), row.user_id);
      userDiscord.set(row.user_id, {
        discordId: row.discord_id,
        discordUsername: row.discord_username,
      });
    }
  } catch {
    // Optional — holders still work without Discord tables
  }

  return { walletToUserId, userDiscord };
}

/** @deprecated Use getWalletIdentityMaps */
export async function getWalletDiscordMap(): Promise<{
  walletToDiscord: Map<string, string>;
  discordNames: Map<string, string>;
}> {
  const { walletToUserId, userDiscord } = await getWalletIdentityMaps();
  const walletToDiscord = new Map<string, string>();
  const discordNames = new Map<string, string>();

  for (const [wallet, userId] of walletToUserId) {
    const info = userDiscord.get(userId);
    if (info?.discordId) {
      walletToDiscord.set(wallet, info.discordId);
      if (info.discordUsername) {
        discordNames.set(info.discordId, info.discordUsername);
      }
    }
  }

  return { walletToDiscord, discordNames };
}

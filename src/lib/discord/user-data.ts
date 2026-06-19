import { getPool } from "@/lib/db";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import { fetchHubWalletHoldings, type HubWalletHoldings } from "@/lib/hub/wallet-nfts";
import { collectionConfigs } from "@/content/site";

export type DiscordUserProfile = {
  discordId: string;
  discordUsername: string | null;
  avatarUrl: string;
  linkedWallets: string[];
  holdings: HubWalletHoldings;
  cashoutSol: number;
  cashoutUsd: number;
};

async function getLinkedWalletsForDiscordId(discordId: string): Promise<{
  userId: number | null;
  discordUsername: string | null;
  discordImage: string | null;
  wallets: string[];
}> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: number;
    discord_username: string | null;
    discord_image: string | null;
    wallet_address: string;
  }>(
    `SELECT u.id AS user_id, u.discord_username, u.discord_image, uw.wallet_address
     FROM users u
     JOIN user_wallets uw ON uw.user_id = u.id
     LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
     WHERE u.discord_id = $1 OR a."providerAccountId" = $1
     ORDER BY uw.is_primary DESC, uw.linked_at ASC`,
    [discordId],
  );

  if (rows.length === 0) {
    return { userId: null, discordUsername: null, discordImage: null, wallets: [] };
  }

  const wallets = [...new Set(rows.map((r) => r.wallet_address))];
  return {
    userId: rows[0].user_id,
    discordUsername: rows[0].discord_username,
    discordImage: rows[0].discord_image,
    wallets,
  };
}

function defaultDiscordAvatarUrl(discordId: string): string {
  const index = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

async function resolveDiscordAvatarUrl(discordId: string, storedImage: string | null): Promise<string> {
  if (storedImage) {
    return storedImage;
  }

  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (token) {
    try {
      const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const user = (await res.json()) as { avatar?: string | null };
        if (user.avatar) {
          return `https://cdn.discordapp.com/avatars/${discordId}/${user.avatar}.png`;
        }
      }
    } catch {
      // fall through to default avatar
    }
  }

  return defaultDiscordAvatarUrl(discordId);
}

function emptyHoldings(): HubWalletHoldings {
  return {
    buxBalance: 0,
    collections: Object.fromEntries(collectionConfigs.map((c) => [c.id, []])),
  };
}

function mergeHoldings(parts: HubWalletHoldings[]): HubWalletHoldings {
  const merged = emptyHoldings();
  let buxBalance = 0;

  for (const part of parts) {
    buxBalance += part.buxBalance;
    for (const config of collectionConfigs) {
      merged.collections[config.id].push(...part.collections[config.id]);
    }
  }

  merged.buxBalance = buxBalance;
  return merged;
}

export async function getDiscordUserProfile(discordId: string): Promise<DiscordUserProfile | null> {
  const { discordUsername, discordImage, wallets } = await getLinkedWalletsForDiscordId(discordId);
  if (wallets.length === 0) {
    return null;
  }

  const [holdingsParts, metrics, avatarUrl] = await Promise.all([
    Promise.all(wallets.map((w) => fetchHubWalletHoldings(w))),
    fetchTokenMetrics(),
    resolveDiscordAvatarUrl(discordId, discordImage),
  ]);

  const holdings = mergeHoldings(holdingsParts);
  const tokenValue = metrics?.tokenValue ?? 0;
  const solPrice = metrics?.solPrice ?? 0;
  const cashoutSol = holdings.buxBalance * tokenValue;

  return {
    discordId,
    discordUsername,
    avatarUrl,
    linkedWallets: wallets,
    holdings,
    cashoutSol,
    cashoutUsd: cashoutSol * solPrice,
  };
}

export function countNftsByCollection(holdings: HubWalletHoldings): { name: string; count: number }[] {
  return collectionConfigs.map((c) => ({
    name: c.name,
    count: holdings.collections[c.id]?.length ?? 0,
  }));
}

export async function lookupDiscordUsernameByWallet(wallet: string): Promise<string | null> {
  if (!process.env.POSTGRES_URL) {
    return null;
  }

  try {
    const { rows } = await getPool().query<{ discord_username: string | null }>(
      `SELECT u.discord_username
       FROM user_wallets uw
       JOIN users u ON u.id = uw.user_id
       WHERE LOWER(uw.wallet_address) = LOWER($1)
       LIMIT 1`,
      [wallet],
    );
    const username = rows[0]?.discord_username?.trim();
    return username || null;
  } catch {
    return null;
  }
}

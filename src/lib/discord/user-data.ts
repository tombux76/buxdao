import { getPool } from "@/lib/db";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import { fetchHubWalletHoldings, type HubWalletHoldings } from "@/lib/hub/wallet-nfts";
import { collectionConfigs } from "@/content/site";

export type DiscordUserProfile = {
  discordId: string;
  discordUsername: string | null;
  linkedWallets: string[];
  holdings: HubWalletHoldings;
  cashoutSol: number;
  cashoutUsd: number;
};

async function getLinkedWalletsForDiscordId(discordId: string): Promise<{
  userId: number | null;
  discordUsername: string | null;
  wallets: string[];
}> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: number;
    discord_username: string | null;
    wallet_address: string;
  }>(
    `SELECT u.id AS user_id, u.discord_username, uw.wallet_address
     FROM users u
     JOIN user_wallets uw ON uw.user_id = u.id
     LEFT JOIN accounts a ON a."userId" = u.id AND a.provider = 'discord'
     WHERE u.discord_id = $1 OR a."providerAccountId" = $1
     ORDER BY uw.is_primary DESC, uw.linked_at ASC`,
    [discordId],
  );

  if (rows.length === 0) {
    return { userId: null, discordUsername: null, wallets: [] };
  }

  const wallets = [...new Set(rows.map((r) => r.wallet_address))];
  return {
    userId: rows[0].user_id,
    discordUsername: rows[0].discord_username,
    wallets,
  };
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
  const { discordUsername, wallets } = await getLinkedWalletsForDiscordId(discordId);
  if (wallets.length === 0) {
    return null;
  }

  const [holdingsParts, metrics] = await Promise.all([
    Promise.all(wallets.map((w) => fetchHubWalletHoldings(w))),
    fetchTokenMetrics(),
  ]);

  const holdings = mergeHoldings(holdingsParts);
  const tokenValue = metrics?.tokenValue ?? 0;
  const solPrice = metrics?.solPrice ?? 0;
  const cashoutSol = holdings.buxBalance * tokenValue;

  return {
    discordId,
    discordUsername,
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

import { getPool } from "@/lib/db";
import { getDiscordRolesForUser } from "@/lib/hub/discord-roles";
import {
  getFirstLinkedWalletAddress,
  userHasLinkedWallet,
} from "@/lib/holder-rewards/wallet-auth";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";
import { POOL_CACHE_TTL_MS, PRIZE_EMPIRE_AMOUNT } from "@/lib/prize-draw/config";

export type PrizeDrawEntry = {
  userId: string;
  discordId: string;
  discordUsername: string;
  discordImage: string | null;
  payoutWallet: string;
};

export type PrizeDrawUserChecklist = {
  discordConnected: boolean;
  walletConnected: boolean;
  holderVerified: boolean;
  payoutWallet: string | null;
  eligible: boolean;
};

export type PrizeDrawWinnerRow = {
  id: number;
  winnerDiscordUsername: string | null;
  winnerDiscordImage: string | null;
  payoutWallet: string;
  prizeAmount: number;
  prizeUsdValue: number | null;
  txSignature: string;
  eligiblePoolSize: number;
  createdAt: string;
};

let cachedPool: PrizeDrawEntry[] | null = null;
let cachedPoolAt = 0;

async function listHubUsersWithDiscord(): Promise<
  { userId: string; discordId: string; discordUsername: string }[]
> {
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: string;
    discord_id: string;
    discord_username: string | null;
  }>(
    `SELECT DISTINCT u.id::text AS user_id, u.discord_id, u.discord_username
     FROM users u
     INNER JOIN user_wallets uw ON uw.user_id = u.id
     WHERE u.discord_id IS NOT NULL`,
  );

  return rows.map((row) => ({
    userId: row.user_id,
    discordId: row.discord_id,
    discordUsername: row.discord_username ?? row.discord_id,
  }));
}

async function isUserEligibleForPool(userId: string): Promise<PrizeDrawEntry | null> {
  const [{ roles }, payoutWallet, discord] = await Promise.all([
    getDiscordRolesForUser(userId),
    getFirstLinkedWalletAddress(userId),
    getLinkedDiscord(userId),
  ]);

  // Eligible = in the DB with a linked wallet + holds a BUXDAO holder role.
  if (roles.length === 0 || !payoutWallet || !discord?.discordId) {
    return null;
  }

  return {
    userId,
    discordId: discord.discordId,
    discordUsername: discord.username ?? discord.discordId,
    discordImage: discord.image ?? null,
    payoutWallet,
  };
}

/** Unique verified holders — one entry per Hub user. Cached for status page. */
export async function buildEligiblePool(forceRefresh = false): Promise<PrizeDrawEntry[]> {
  if (
    !forceRefresh &&
    cachedPool &&
    Date.now() - cachedPoolAt < POOL_CACHE_TTL_MS
  ) {
    return cachedPool;
  }

  const candidates = await listHubUsersWithDiscord();
  const entries: PrizeDrawEntry[] = [];

  const batchSize = 8;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (candidate) => isUserEligibleForPool(candidate.userId)),
    );
    for (const entry of results) {
      if (entry) {
        entries.push(entry);
      }
    }
  }

  cachedPool = entries;
  cachedPoolAt = Date.now();
  return entries;
}

export async function getPrizeDrawUserChecklist(userId: string): Promise<PrizeDrawUserChecklist> {
  const [discord, walletConnected, payoutWallet, rolesResult] = await Promise.all([
    getLinkedDiscord(userId),
    userHasLinkedWallet(userId),
    getFirstLinkedWalletAddress(userId),
    getDiscordRolesForUser(userId),
  ]);

  const discordConnected = Boolean(discord?.discordId);
  const holderVerified = rolesResult.roles.length > 0;
  const eligible =
    discordConnected && walletConnected && holderVerified && Boolean(payoutWallet);

  return {
    discordConnected,
    walletConnected,
    holderVerified,
    payoutWallet,
    eligible,
  };
}

export async function listPastWinners(limit = 20): Promise<PrizeDrawWinnerRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<{
    id: number;
    winner_discord_username: string | null;
    winner_discord_image: string | null;
    payout_wallet: string;
    prize_amount_raw: string;
    prize_usd_value: number | null;
    tx_signature: string;
    eligible_pool_size: number;
    created_at: Date;
  }>(
    `SELECT id, winner_discord_username, winner_discord_image, payout_wallet, prize_amount_raw,
            prize_usd_value, tx_signature, eligible_pool_size, created_at
     FROM prize_draws
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => ({
    id: row.id,
    winnerDiscordUsername: row.winner_discord_username,
    winnerDiscordImage: row.winner_discord_image,
    payoutWallet: row.payout_wallet,
    prizeAmount: PRIZE_EMPIRE_AMOUNT,
    prizeUsdValue: row.prize_usd_value,
    txSignature: row.tx_signature,
    eligiblePoolSize: row.eligible_pool_size,
    createdAt: row.created_at.toISOString(),
  }));
}

export function pickRandomWinner(entries: PrizeDrawEntry[]): PrizeDrawEntry {
  if (entries.length === 0) {
    throw new Error("No eligible holders in the prize pool");
  }

  const index = crypto.getRandomValues(new Uint32Array(1))[0]! % entries.length;
  return entries[index]!;
}

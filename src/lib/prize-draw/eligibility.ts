import { getPool } from "@/lib/db";
import { buildRawHolders, isHiddenWallet } from "@/lib/bux/helius-holders";
import { getWalletIdentityMaps } from "@/lib/bux/discord";
import {
  getFirstLinkedWalletAddress,
  userHasLinkedWallet,
} from "@/lib/holder-rewards/wallet-auth";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";
import { POOL_CACHE_TTL_MS, PRIZE_EMPIRE_AMOUNT } from "@/lib/prize-draw/config";

export type PrizeDrawEntry = {
  userId: string;
  discordId: string | null;
  discordUsername: string;
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

/**
 * Eligible = same rule as the /bux Top Holders table: a verified holder whose
 * Discord name shows (linked username) and who holds ≥1 BUXDAO NFT. Built from
 * the DB identity map + on-chain holdings (no flaky per-user Discord API calls),
 * so the count is stable. One entry per user; payout goes to the first linked wallet.
 */
export async function buildEligiblePool(forceRefresh = false): Promise<PrizeDrawEntry[]> {
  if (!forceRefresh && cachedPool && Date.now() - cachedPoolAt < POOL_CACHE_TTL_MS) {
    return cachedPool;
  }

  const [rawHolders, { walletToUserId, userDiscord }] = await Promise.all([
    // Live DAS only — never let a stale snapshot keep sold NFTs in the prize pool.
    buildRawHolders({ allowSnapshot: false }),
    getWalletIdentityMaps(),
  ]);

  const nftsByUser = new Map<number, number>();
  for (const holder of rawHolders) {
    if (holder.totalNfts <= 0 || isHiddenWallet(holder.wallet)) {
      continue;
    }
    const userId = walletToUserId.get(holder.wallet.toLowerCase());
    if (userId == null) {
      continue;
    }
    nftsByUser.set(userId, (nftsByUser.get(userId) ?? 0) + holder.totalNfts);
  }

  const eligibleUserIds: { userId: number; discordId: string | null; discordUsername: string }[] = [];
  for (const [userId, totalNfts] of nftsByUser) {
    if (totalNfts <= 0) {
      continue;
    }
    const discord = userDiscord.get(userId);
    // "Name shows instead of wallet" — must have a linked Discord username.
    if (!discord?.discordUsername) {
      continue;
    }
    eligibleUserIds.push({
      userId,
      discordId: discord.discordId,
      discordUsername: discord.discordUsername,
    });
  }

  const entries = (
    await Promise.all(
      eligibleUserIds.map(async (candidate) => {
        const payoutWallet = await getFirstLinkedWalletAddress(String(candidate.userId));
        if (!payoutWallet) {
          return null;
        }
        return {
          userId: String(candidate.userId),
          discordId: candidate.discordId,
          discordUsername: candidate.discordUsername,
          payoutWallet,
        } satisfies PrizeDrawEntry;
      }),
    )
  ).filter((entry): entry is PrizeDrawEntry => entry !== null);

  cachedPool = entries;
  cachedPoolAt = Date.now();
  return entries;
}

export async function getPrizeDrawUserChecklist(userId: string): Promise<PrizeDrawUserChecklist> {
  const [discord, walletConnected, payoutWallet, pool] = await Promise.all([
    getLinkedDiscord(userId),
    userHasLinkedWallet(userId),
    getFirstLinkedWalletAddress(userId),
    buildEligiblePool(),
  ]);

  const discordConnected = Boolean(discord?.discordId);
  const inPool = pool.some((entry) => entry.userId === userId);
  const eligible = discordConnected && walletConnected && inPool && Boolean(payoutWallet);

  return {
    discordConnected,
    walletConnected,
    holderVerified: inPool,
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

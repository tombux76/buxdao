import { collectionConfigs } from "@/content/site";
import { getPool } from "@/lib/db";
import { dailyYieldToRaw } from "@/lib/holder-rewards/accounts";
import { getRewardDateEt } from "@/lib/holder-rewards/dates";
import {
  discoverQualifyingNfts,
  getHoldStartedAtForMint,
  listAllLinkedWallets,
  syncAllHoldStates,
} from "@/lib/holder-rewards/hold-tracking";
import { loyaltyMultiplierFromHoldStartedAt } from "@/lib/holder-rewards/loyalty";
import { getBonusMultiplier } from "@/lib/holder-rewards/multipliers";

export type NftAccrualLine = {
  mint: string;
  collectionId: string;
  wallet: string;
  baseYield: number;
  bonusMult: number;
  loyaltyMult: number;
  amountRaw: string;
};

export type AccrualResult = {
  rewardDateEt: string;
  usersProcessed: number;
  usersAccrued: number;
  totalRawAccrued: string;
  skippedAlreadyRun: boolean;
};

const yieldByCollectionId = new Map(
  collectionConfigs.map((c) => [c.id, c.dailyBuxYield] as const),
);

function computeNftDailyRaw(params: {
  collectionId: string;
  mint: string;
  holdStartedAt: Date | null;
  rewardDateEt: string;
}): { amountRaw: bigint; bonusMult: number; loyaltyMult: number; baseYield: number } {
  const baseYield = yieldByCollectionId.get(params.collectionId) ?? 0;
  const bonusMult = getBonusMultiplier(params.mint, params.collectionId);
  const loyaltyMult = loyaltyMultiplierFromHoldStartedAt(params.holdStartedAt, params.rewardDateEt);
  const baseRaw = dailyYieldToRaw(baseYield);
  const amountRaw = BigInt(
    Math.floor(Number(baseRaw) * bonusMult * loyaltyMult),
  );
  return { amountRaw, bonusMult, loyaltyMult, baseYield };
}

export async function runDailyAccrual(
  rewardDateEt = getRewardDateEt(),
): Promise<AccrualResult> {
  await syncAllHoldStates(rewardDateEt);

  const links = await listAllLinkedWallets();
  const byUser = await discoverQualifyingNfts(links);
  const pool = getPool();

  let usersAccrued = 0;
  let totalRaw = BigInt(0);

  for (const [userId, nfts] of byUser) {
    const existing = await pool.query<{ id: number }>(
      `SELECT id FROM holder_reward_accruals WHERE user_id = $1 AND reward_date_et = $2::date`,
      [userId, rewardDateEt],
    );
    if (existing.rows.length > 0) {
      continue;
    }

    const breakdown: NftAccrualLine[] = [];
    let userTotalRaw = BigInt(0);

    for (const nft of nfts) {
      const holdStartedAt = await getHoldStartedAtForMint(nft.mint);
      const computed = computeNftDailyRaw({
        collectionId: nft.collectionId,
        mint: nft.mint,
        holdStartedAt,
        rewardDateEt,
      });
      if (computed.amountRaw <= BigInt(0)) {
        continue;
      }
      userTotalRaw += computed.amountRaw;
      breakdown.push({
        mint: nft.mint,
        collectionId: nft.collectionId,
        wallet: nft.wallet,
        baseYield: computed.baseYield,
        bonusMult: computed.bonusMult,
        loyaltyMult: computed.loyaltyMult,
        amountRaw: computed.amountRaw.toString(),
      });
    }

    if (userTotalRaw <= BigInt(0)) {
      continue;
    }

    await pool.query(
      `INSERT INTO holder_reward_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );

    await pool.query(
      `INSERT INTO holder_reward_accruals (user_id, reward_date_et, amount_raw, nft_count, breakdown)
       VALUES ($1, $2::date, $3, $4, $5::jsonb)`,
      [userId, rewardDateEt, userTotalRaw.toString(), breakdown.length, JSON.stringify(breakdown)],
    );

    await pool.query(
      `UPDATE holder_reward_accounts
       SET unclaimed_balance_raw = unclaimed_balance_raw + $2,
           updated_at = now()
       WHERE user_id = $1`,
      [userId, userTotalRaw.toString()],
    );

    usersAccrued += 1;
    totalRaw += userTotalRaw;
  }

  return {
    rewardDateEt,
    usersProcessed: byUser.size,
    usersAccrued,
    totalRawAccrued: totalRaw.toString(),
    skippedAlreadyRun: false,
  };
}

export async function getRecentAccruals(userId: string, limit = 7) {
  const pool = getPool();
  const { rows } = await pool.query<{
    reward_date_et: string;
    amount_raw: string;
    nft_count: number;
  }>(
    `SELECT reward_date_et::text, amount_raw, nft_count
     FROM holder_reward_accruals
     WHERE user_id = $1
     ORDER BY reward_date_et DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

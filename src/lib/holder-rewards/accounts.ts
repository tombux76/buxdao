import { getPool } from "@/lib/db";
import { BUX_DECIMALS, buxRawToNumber } from "@/lib/holder-rewards/config";

export type HolderRewardAccount = {
  userId: string;
  unclaimedBalanceRaw: bigint;
  unclaimedBalanceBux: number;
  totalClaimedRaw: bigint;
  totalClaimedBux: number;
};

export async function ensureRewardAccount(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO holder_reward_accounts (user_id)
     VALUES ($1)
     ON CONFLICT (user_id) DO NOTHING`,
    [userId],
  );
}

export async function getRewardAccount(userId: string): Promise<HolderRewardAccount> {
  await ensureRewardAccount(userId);
  const pool = getPool();
  const { rows } = await pool.query<{
    user_id: number;
    unclaimed_balance_raw: string;
    total_claimed_raw: string;
  }>(
    `SELECT user_id, unclaimed_balance_raw, total_claimed_raw
     FROM holder_reward_accounts WHERE user_id = $1`,
    [userId],
  );

  const row = rows[0];
  const unclaimedBalanceRaw = BigInt(row?.unclaimed_balance_raw ?? "0");
  const totalClaimedRaw = BigInt(row?.total_claimed_raw ?? "0");

  return {
    userId,
    unclaimedBalanceRaw,
    unclaimedBalanceBux: buxRawToNumber(unclaimedBalanceRaw),
    totalClaimedRaw,
    totalClaimedBux: buxRawToNumber(totalClaimedRaw),
  };
}

export async function resetAllRewardBalances(): Promise<number> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `UPDATE holder_reward_accounts SET unclaimed_balance_raw = 0, updated_at = now()`,
  );
  return rowCount ?? 0;
}

export function dailyYieldToRaw(dailyBuxYield: number): bigint {
  return BigInt(dailyBuxYield) * BigInt(10 ** BUX_DECIMALS);
}

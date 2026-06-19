import { getPool } from "@/lib/db";
import { ensureRewardAccount, getRewardAccount } from "@/lib/holder-rewards/accounts";
import { buxRawToNumber, buxToRaw } from "@/lib/holder-rewards/config";
import { getRewardDateEt } from "@/lib/holder-rewards/dates";

export type RewardCreditSource = "admin" | "discord_message" | "discord_reaction";

export type CreditRewardParams = {
  userId: string;
  source: RewardCreditSource;
  amountBux: number;
  rewardDateEt?: string;
  dedupKey?: string | null;
  metadata?: Record<string, unknown>;
};

export type CreditRewardResult =
  | { ok: true; credited: true; newBalanceBux: number }
  | { ok: true; credited: false; reason: "duplicate" }
  | { ok: false; reason: string };

function assertWholeBux(amountBux: number): void {
  if (!Number.isFinite(amountBux) || amountBux <= 0 || !Number.isInteger(amountBux)) {
    throw new Error("Amount must be a positive whole number of BUX");
  }
}

export async function creditRewardAccount(params: CreditRewardParams): Promise<CreditRewardResult> {
  assertWholeBux(params.amountBux);

  const amountRaw = buxToRaw(params.amountBux);
  const rewardDateEt = params.rewardDateEt ?? getRewardDateEt();
  const metadata = JSON.stringify(params.metadata ?? {});

  await ensureRewardAccount(params.userId);
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const insert = await client.query<{ id: string }>(
      `INSERT INTO holder_reward_ledger (user_id, source, amount_raw, reward_date_et, dedup_key, metadata)
       VALUES ($1, $2, $3, $4::date, $5, $6::jsonb)
       ON CONFLICT (dedup_key) DO NOTHING
       RETURNING id`,
      [params.userId, params.source, amountRaw.toString(), rewardDateEt, params.dedupKey ?? null, metadata],
    );

    if (insert.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: true, credited: false, reason: "duplicate" };
    }

    await client.query(
      `UPDATE holder_reward_accounts
       SET unclaimed_balance_raw = unclaimed_balance_raw + $2,
           updated_at = now()
       WHERE user_id = $1`,
      [params.userId, amountRaw.toString()],
    );

    if (params.source === "discord_message" || params.source === "discord_reaction") {
      const messageDelta = params.source === "discord_message" ? 1 : 0;
      const reactionDelta = params.source === "discord_reaction" ? 1 : 0;
      const messageBuxDelta = params.source === "discord_message" ? amountRaw.toString() : "0";
      const reactionBuxDelta = params.source === "discord_reaction" ? amountRaw.toString() : "0";

      await client.query(
        `INSERT INTO discord_engagement_daily
           (user_id, reward_date_et, messages_count, reactions_count, messages_bux_raw, reactions_bux_raw)
         VALUES ($1, $2::date, $3, $4, $5, $6)
         ON CONFLICT (user_id, reward_date_et) DO UPDATE SET
           messages_count = discord_engagement_daily.messages_count + EXCLUDED.messages_count,
           reactions_count = discord_engagement_daily.reactions_count + EXCLUDED.reactions_count,
           messages_bux_raw = discord_engagement_daily.messages_bux_raw + EXCLUDED.messages_bux_raw,
           reactions_bux_raw = discord_engagement_daily.reactions_bux_raw + EXCLUDED.reactions_bux_raw,
           updated_at = now()`,
        [params.userId, rewardDateEt, messageDelta, reactionDelta, messageBuxDelta, reactionBuxDelta],
      );
    }

    await client.query("COMMIT");

    const account = await getRewardAccount(params.userId);
    return { ok: true, credited: true, newBalanceBux: account.unclaimedBalanceBux };
  } catch (error) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Credit failed";
    return { ok: false, reason: message };
  } finally {
    client.release();
  }
}

export async function countMessageCreditsToday(userId: string, rewardDateEt: string): Promise<number> {
  const { rows } = await getPool().query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM holder_reward_ledger
     WHERE user_id = $1 AND source = 'discord_message' AND reward_date_et = $2::date`,
    [userId, rewardDateEt],
  );
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

export async function getLastMessageCreditAt(userId: string): Promise<Date | null> {
  const { rows } = await getPool().query<{ message_timestamp: string | null }>(
    `SELECT metadata->>'messageTimestamp' AS message_timestamp
     FROM holder_reward_ledger
     WHERE user_id = $1 AND source = 'discord_message'
     ORDER BY COALESCE(metadata->>'messageTimestamp', created_at::text) DESC
     LIMIT 1`,
    [userId],
  );
  const ts = rows[0]?.message_timestamp;
  return ts ? new Date(ts) : null;
}

export type TodayEngagement = {
  rewardDateEt: string;
  messagesCount: number;
  reactionsCount: number;
  messagesBux: number;
  reactionsBux: number;
  totalEngagementBux: number;
};

export async function getTodayEngagement(userId: string): Promise<TodayEngagement> {
  const rewardDateEt = getRewardDateEt();
  const { rows } = await getPool().query<{
    messages_count: number;
    reactions_count: number;
    messages_bux_raw: string;
    reactions_bux_raw: string;
  }>(
    `SELECT messages_count, reactions_count, messages_bux_raw, reactions_bux_raw
     FROM discord_engagement_daily
     WHERE user_id = $1 AND reward_date_et = $2::date`,
    [userId, rewardDateEt],
  );

  const row = rows[0];
  const messagesBux = buxRawToNumber(row?.messages_bux_raw ?? 0);
  const reactionsBux = buxRawToNumber(row?.reactions_bux_raw ?? 0);

  return {
    rewardDateEt,
    messagesCount: row?.messages_count ?? 0,
    reactionsCount: row?.reactions_count ?? 0,
    messagesBux,
    reactionsBux,
    totalEngagementBux: messagesBux + reactionsBux,
  };
}

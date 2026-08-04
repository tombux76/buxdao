import { getPool } from "@/lib/db";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";
import { postPrizeDrawAnnouncement } from "@/lib/prize-draw/discord-announce";
import { buildEligiblePool, pickRandomWinner } from "@/lib/prize-draw/eligibility";
import {
  empireToRaw,
  fetchEmpireTokenImage,
  fetchEmpireUsdPrice,
  getEmpireDecimals,
} from "@/lib/prize-draw/empire-token";
import { EMPIRE_TOKEN_MINT, PRIZE_EMPIRE_AMOUNT, PRIZE_WALLET } from "@/lib/prize-draw/config";
import { isValidTxSignature, verifyEmpirePrizeTransfer } from "@/lib/prize-draw/verify-transfer";

export type PreparePrizeDrawResult = {
  mint: string;
  prizeWallet: string;
  amountRaw: string;
  prizeAmount: number;
  eligiblePoolSize: number;
  winner: {
    discordUsername: string;
    discordImage: string | null;
    payoutWallet: string;
  };
};

export type ConfirmPrizeDrawResult = {
  drawId: number;
  txSignature: string;
  prizeAmount: number;
  prizeUsdValue: number | null;
  eligiblePoolSize: number;
  winner: {
    discordUsername: string;
    payoutWallet: string;
  };
};

function assertPrizeWallet(walletAddress: string): void {
  if (walletAddress !== PRIZE_WALLET) {
    throw new Error("Connect the prize wallet to run the draw");
  }
}

async function ensureDiscordAnnouncedColumn(): Promise<void> {
  const pool = getPool();
  await pool.query(
    `ALTER TABLE prize_draws ADD COLUMN IF NOT EXISTS discord_announced_at TIMESTAMPTZ`,
  );
}

async function announcePrizeDrawWithRetries(params: {
  winnerDiscordUsername: string;
  payoutWallet: string;
  prizeUsdValue: number | null;
  txSignature: string;
  eligiblePoolSize: number;
}): Promise<void> {
  let lastError: Error | null = null;
  const tokenImageUrl = await fetchEmpireTokenImage().catch(() => null);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1_000 * attempt));
    }
    try {
      await postPrizeDrawAnnouncement({
        winnerDiscordUsername: params.winnerDiscordUsername,
        payoutWallet: params.payoutWallet,
        prizeAmount: PRIZE_EMPIRE_AMOUNT,
        prizeUsdValue: params.prizeUsdValue,
        txSignature: params.txSignature,
        eligiblePoolSize: params.eligiblePoolSize,
        tokenImageUrl,
      });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[prize-draw] Discord announce attempt failed:", lastError.message);
    }
  }

  throw lastError ?? new Error("Discord announcement failed");
}

async function markDiscordAnnounced(txSignature: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE prize_draws SET discord_announced_at = COALESCE(discord_announced_at, now())
     WHERE tx_signature = $1`,
    [txSignature],
  );
}

/**
 * Picks a random eligible holder and stashes a pending draw. No tokens move here —
 * the prize-wallet owner signs the EMPIRE transfer client-side, then calls confirm.
 */
export async function preparePrizeDraw(params: {
  userId: string;
  walletAddress: string;
}): Promise<PreparePrizeDrawResult> {
  assertPrizeWallet(params.walletAddress);

  const entries = await buildEligiblePool(true);
  if (entries.length === 0) {
    throw new Error("No eligible holders — nobody qualifies for the draw yet");
  }

  const winner = pickRandomWinner(entries);
  const decimals = await getEmpireDecimals();
  const amountRaw = empireToRaw(PRIZE_EMPIRE_AMOUNT, decimals);

  const winnerDiscord = await getLinkedDiscord(winner.userId);
  const winnerUsername = winnerDiscord?.username ?? winner.discordUsername;
  const winnerImage = winnerDiscord?.image ?? null;

  const pool = getPool();
  await pool.query(
    `INSERT INTO prize_draw_pending (
       prepared_by_user_id, winner_user_id, winner_discord_id, winner_discord_username,
       winner_discord_image, payout_wallet, prize_amount_raw, eligible_pool_size
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (prepared_by_user_id) DO UPDATE SET
       winner_user_id = EXCLUDED.winner_user_id,
       winner_discord_id = EXCLUDED.winner_discord_id,
       winner_discord_username = EXCLUDED.winner_discord_username,
       winner_discord_image = EXCLUDED.winner_discord_image,
       payout_wallet = EXCLUDED.payout_wallet,
       prize_amount_raw = EXCLUDED.prize_amount_raw,
       eligible_pool_size = EXCLUDED.eligible_pool_size,
       created_at = now()`,
    [
      params.userId,
      winner.userId,
      winner.discordId,
      winnerUsername,
      winnerImage,
      winner.payoutWallet,
      amountRaw.toString(),
      entries.length,
    ],
  );

  return {
    mint: EMPIRE_TOKEN_MINT,
    prizeWallet: PRIZE_WALLET,
    amountRaw: amountRaw.toString(),
    prizeAmount: PRIZE_EMPIRE_AMOUNT,
    eligiblePoolSize: entries.length,
    winner: {
      discordUsername: winnerUsername,
      discordImage: winnerImage,
      payoutWallet: winner.payoutWallet,
    },
  };
}

type PendingRow = {
  winner_user_id: number;
  winner_discord_id: string | null;
  winner_discord_username: string | null;
  winner_discord_image: string | null;
  payout_wallet: string;
  prize_amount_raw: string;
  eligible_pool_size: number;
};

/**
 * Verifies the prize-wallet-signed EMPIRE transfer on-chain, records the draw,
 * clears the pending row, and announces the winner in Discord.
 */
export async function confirmPrizeDraw(params: {
  userId: string;
  walletAddress: string;
  txSignature: string;
}): Promise<ConfirmPrizeDrawResult> {
  assertPrizeWallet(params.walletAddress);

  if (!isValidTxSignature(params.txSignature)) {
    throw new Error("Invalid transaction signature");
  }

  await ensureDiscordAnnouncedColumn();
  const pool = getPool();

  const existing = await pool.query<{
    id: number;
    winner_discord_username: string | null;
    payout_wallet: string;
    prize_usd_value: string | null;
    eligible_pool_size: number;
    discord_announced_at: Date | string | null;
  }>(
    `SELECT id, winner_discord_username, payout_wallet, prize_usd_value, eligible_pool_size,
            discord_announced_at
     FROM prize_draws WHERE tx_signature = $1`,
    [params.txSignature],
  );

  if (existing.rows[0]) {
    const row = existing.rows[0];
    const result: ConfirmPrizeDrawResult = {
      drawId: row.id,
      txSignature: params.txSignature,
      prizeAmount: PRIZE_EMPIRE_AMOUNT,
      prizeUsdValue: row.prize_usd_value != null ? Number(row.prize_usd_value) : null,
      eligiblePoolSize: row.eligible_pool_size,
      winner: {
        discordUsername: row.winner_discord_username ?? row.payout_wallet,
        payoutWallet: row.payout_wallet,
      },
    };

    // Site may already show the winner while Discord still failed — finish announce on retry.
    if (!row.discord_announced_at) {
      await announcePrizeDrawWithRetries({
        winnerDiscordUsername: result.winner.discordUsername,
        payoutWallet: result.winner.payoutWallet,
        prizeUsdValue: result.prizeUsdValue,
        txSignature: params.txSignature,
        eligiblePoolSize: result.eligiblePoolSize,
      });
      await markDiscordAnnounced(params.txSignature);
    }

    return result;
  }

  const pendingResult = await pool.query<PendingRow>(
    `SELECT winner_user_id, winner_discord_id, winner_discord_username, winner_discord_image,
            payout_wallet, prize_amount_raw, eligible_pool_size
     FROM prize_draw_pending WHERE prepared_by_user_id = $1`,
    [params.userId],
  );
  const pending = pendingResult.rows[0];
  if (!pending) {
    throw new Error("No draw in progress — start again");
  }

  const amountRaw = BigInt(pending.prize_amount_raw);

  await verifyEmpirePrizeTransfer({
    signature: params.txSignature,
    recipientWallet: pending.payout_wallet,
    amountRaw,
  });

  const empireUsdPrice = await fetchEmpireUsdPrice();
  const prizeUsdValue = empireUsdPrice != null ? PRIZE_EMPIRE_AMOUNT * empireUsdPrice : null;

  const client = await pool.connect();
  let drawId = 0;
  try {
    await client.query("BEGIN");

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO prize_draws (
         winner_user_id, winner_discord_id, winner_discord_username, winner_discord_image,
         payout_wallet, prize_amount_raw, empire_usd_price, prize_usd_value, tx_signature,
         eligible_pool_size, drawn_by_user_id
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        pending.winner_user_id,
        pending.winner_discord_id,
        pending.winner_discord_username,
        pending.winner_discord_image,
        pending.payout_wallet,
        amountRaw.toString(),
        empireUsdPrice,
        prizeUsdValue,
        params.txSignature,
        pending.eligible_pool_size,
        params.userId,
      ],
    );
    drawId = inserted.rows[0]?.id ?? 0;

    await client.query(`DELETE FROM prize_draw_pending WHERE prepared_by_user_id = $1`, [
      params.userId,
    ]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // DB is committed first so /empire-draw updates even if Discord flakes; client
  // retries will re-enter via the existing-signature path until Discord is marked done.
  await announcePrizeDrawWithRetries({
    winnerDiscordUsername: pending.winner_discord_username ?? pending.payout_wallet,
    payoutWallet: pending.payout_wallet,
    prizeUsdValue,
    txSignature: params.txSignature,
    eligiblePoolSize: pending.eligible_pool_size,
  });
  await markDiscordAnnounced(params.txSignature);

  return {
    drawId,
    txSignature: params.txSignature,
    prizeAmount: PRIZE_EMPIRE_AMOUNT,
    prizeUsdValue,
    eligiblePoolSize: pending.eligible_pool_size,
    winner: {
      discordUsername: pending.winner_discord_username ?? pending.payout_wallet,
      payoutWallet: pending.payout_wallet,
    },
  };
}

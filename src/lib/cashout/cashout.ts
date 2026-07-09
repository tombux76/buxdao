import { getPool } from "@/lib/db";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import {
  buxRawToNumber,
  buxToRaw,
  getLiquidityWallet,
  isLiquidityConfigured,
} from "@/lib/cashout/config";
import { acquireCashoutLock, assertPendingFresh, isPendingExpired, releaseCashoutLock } from "@/lib/cashout/lock";
import { withLiquidityPayoutLock } from "@/lib/cashout/liquidity-lock";
import { assertProcessingPayoutStillFair, assertQuoteStillValid } from "@/lib/cashout/quote-guard";
import {
  getCashoutFeeBps,
  quoteCashoutSol,
  assertCashoutCooldownAllowed,
  userHasHolderNft,
  userHasWhaleRole,
  validateCashoutAmount,
} from "@/lib/cashout/eligibility";
import { verifyBuxTransferToLiquidity } from "@/lib/cashout/verify-transfer";
import {
  cashoutDisplayName,
  postCashoutAnnouncement,
} from "@/lib/cashout/discord-announce";
import { sendLiquiditySolTransfer } from "@/lib/solana/liquidity";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";
import { fetchHubWalletHoldings } from "@/lib/hub/wallet-nfts";
import { tokenConfig } from "@/content/site";

export type PrepareCashoutResult = {
  liquidityWallet: string;
  mint: string;
  payoutWallet: string;
  amountRaw: string;
  amountBux: number;
  solGross: number;
  feeSol: number;
  solNet: number;
  feeBps: number;
  feePercent: number;
  tokenValue: number;
  resumed: boolean;
  buxTxSignature: string | null;
};

type PendingRow = {
  payout_wallet: string;
  bux_amount_raw: string;
  sol_gross_lamports: string;
  fee_lamports: string;
  sol_net_lamports: string;
  token_value_snapshot: string;
  fee_bps: number;
  bux_tx_signature: string | null;
  created_at: Date;
};

type CompletedCashoutRow = {
  bux_amount: string;
  sol_amount: string;
  fee_lamports: string;
  bux_tx_signature: string;
  tx_signature: string;
};

function mapCompletedRow(row: CompletedCashoutRow) {
  return {
    amountBux: buxRawToNumber(BigInt(row.bux_amount)),
    solNet: Number(BigInt(row.sol_amount ?? "0")) / 1e9,
    feeSol: Number(BigInt(row.fee_lamports ?? "0")) / 1e9,
    buxTxSignature: row.bux_tx_signature,
    solTxSignature: row.tx_signature,
  };
}

async function assertConfirmEligibility(userId: string, row: PendingRow): Promise<void> {
  assertPendingFresh(new Date(row.created_at));
  await assertCashoutCooldownAllowed(userId);

  const hasHolderNft = await userHasHolderNft(userId);
  if (!hasHolderNft) {
    throw new Error("Hold at least one BUXDAO collection NFT in a linked wallet to cash out");
  }

  await assertQuoteStillValid(userId, row);
}

async function loadCompletedByBuxTx(
  pool: ReturnType<typeof getPool>,
  buxTxSignature: string,
  userId: string,
): Promise<CompletedCashoutRow | null> {
  const completed = await pool.query<CompletedCashoutRow>(
    `SELECT bux_amount, sol_amount, fee_lamports, bux_tx_signature, tx_signature
     FROM cashout_transactions
     WHERE bux_tx_signature = $1 AND user_id = $2 AND status = 'completed'`,
    [buxTxSignature, userId],
  );
  return completed.rows[0] ?? null;
}

type ProcessingRow = {
  id: string;
  wallet_address: string;
  bux_amount: string;
  sol_amount: string;
  fee_lamports: string;
  bux_tx_signature: string;
  tx_signature: string | null;
};

async function claimProcessingPayout(params: {
  userId: string;
  payoutWallet: string;
  buxTxSignature: string;
}): Promise<ProcessingRow | null> {
  const pool = getPool();
  const claimed = await pool.query<ProcessingRow>(
    `UPDATE cashout_transactions
     SET status = 'paying'
     WHERE bux_tx_signature = $1
       AND user_id = $2
       AND wallet_address = $3
       AND tx_signature IS NULL
       AND (
         status = 'processing'
         OR (status = 'paying' AND created_at < NOW() - INTERVAL '2 minutes')
       )
     RETURNING id, wallet_address, bux_amount, sol_amount, fee_lamports, bux_tx_signature, tx_signature`,
    [params.buxTxSignature, params.userId, params.payoutWallet],
  );
  return claimed.rows[0] ?? null;
}

async function resumeProcessingCashout(params: {
  userId: string;
  payoutWallet: string;
  buxTxSignature: string;
}): Promise<{
  amountBux: number;
  solNet: number;
  feeSol: number;
  buxTxSignature: string;
  solTxSignature: string;
} | null> {
  const pool = getPool();

  const existing = await pool.query<ProcessingRow>(
    `SELECT id, wallet_address, bux_amount, sol_amount, fee_lamports, bux_tx_signature, tx_signature
     FROM cashout_transactions
     WHERE bux_tx_signature = $1 AND user_id = $2 AND status IN ('processing', 'paying')`,
    [params.buxTxSignature, params.userId],
  );
  const row = existing.rows[0];
  if (!row) {
    return null;
  }
  if (row.wallet_address !== params.payoutWallet) {
    throw new Error("Payout wallet does not match the pending cashout");
  }

  if (row.tx_signature) {
    await pool.query(
      `UPDATE cashout_transactions
       SET status = 'completed', completed_at = now()
       WHERE id = $1`,
      [row.id],
    );
    const amountBux = buxRawToNumber(BigInt(row.bux_amount));
    const solNet = Number(BigInt(row.sol_amount)) / 1e9;
    const feeSol = Number(BigInt(row.fee_lamports ?? "0")) / 1e9;
    return {
      amountBux,
      solNet,
      feeSol,
      buxTxSignature: row.bux_tx_signature,
      solTxSignature: row.tx_signature,
    };
  }

  const claimed = await claimProcessingPayout(params);
  if (!claimed) {
    const completed = await loadCompletedByBuxTx(pool, params.buxTxSignature, params.userId);
    if (completed) {
      return mapCompletedRow(completed);
    }
    throw new Error("SOL payout already in progress — wait a few seconds and confirm again");
  }

  const amountBux = buxRawToNumber(BigInt(claimed.bux_amount));
  const solNetLamports = BigInt(claimed.sol_amount);
  const feeSol = Number(BigInt(claimed.fee_lamports ?? "0")) / 1e9;

  try {
    await verifyBuxTransferToLiquidity({
      signature: params.buxTxSignature,
      fromWallet: params.payoutWallet,
      amountRaw: BigInt(claimed.bux_amount),
    });

    await assertProcessingPayoutStillFair(params.userId, claimed.bux_amount, claimed.sol_amount);

    const solTxSignature = await withLiquidityPayoutLock(() =>
      sendLiquiditySolTransfer({
        recipientWallet: params.payoutWallet,
        lamports: solNetLamports,
      }),
    );

    const finalized = await pool.query<{ tx_signature: string }>(
      `UPDATE cashout_transactions
       SET tx_signature = $1, status = 'completed', completed_at = now()
       WHERE id = $2 AND status = 'paying' AND tx_signature IS NULL
       RETURNING tx_signature`,
      [solTxSignature, claimed.id],
    );

    if (!finalized.rows[0]) {
      const completed = await loadCompletedByBuxTx(pool, params.buxTxSignature, params.userId);
      if (completed) {
        return mapCompletedRow(completed);
      }
      throw new Error("Could not finalize cashout — contact support with your $BUX transaction");
    }

    await announceCashoutIfNeeded({
      userId: params.userId,
      payoutWallet: params.payoutWallet,
      amountBux,
      solNet: Number(solNetLamports) / 1e9,
      buxTxSignature: params.buxTxSignature,
      solTxSignature,
    });

    return {
      amountBux,
      solNet: Number(solNetLamports) / 1e9,
      feeSol,
      buxTxSignature: params.buxTxSignature,
      solTxSignature,
    };
  } catch (error) {
    await pool.query(
      `UPDATE cashout_transactions
       SET status = 'processing'
       WHERE id = $1 AND status = 'paying' AND tx_signature IS NULL`,
      [claimed.id],
    );
    throw error;
  }
}

async function announceCashoutIfNeeded(params: {
  userId: string;
  payoutWallet: string;
  amountBux: number;
  solNet: number;
  buxTxSignature: string;
  solTxSignature: string;
}): Promise<void> {
  try {
    const discord = await getLinkedDiscord(params.userId);
    await postCashoutAnnouncement({
      discordUsername: cashoutDisplayName(discord?.username, params.payoutWallet),
      discordImage: discord?.image ?? null,
      amountBux: params.amountBux,
      solNet: params.solNet,
      buxTxSignature: params.buxTxSignature,
      solTxSignature: params.solTxSignature,
    });
  } catch (error) {
    console.error("[cashout] Discord announcement failed:", error);
  }
}

function isValidTxSignature(signature: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature);
}

function rowToPrepareResult(row: PendingRow, resumed: boolean): PrepareCashoutResult {
  const amountRaw = BigInt(row.bux_amount_raw);
  const solGrossLamports = BigInt(row.sol_gross_lamports);
  const feeLamports = BigInt(row.fee_lamports);
  const solNetLamports = BigInt(row.sol_net_lamports);

  return {
    liquidityWallet: getLiquidityWallet(),
    mint: tokenConfig.mint,
    payoutWallet: row.payout_wallet,
    amountRaw: row.bux_amount_raw,
    amountBux: buxRawToNumber(amountRaw),
    solGross: Number(solGrossLamports) / 1e9,
    feeSol: Number(feeLamports) / 1e9,
    solNet: Number(solNetLamports) / 1e9,
    feeBps: row.fee_bps,
    feePercent: row.fee_bps / 100,
    tokenValue: Number.parseFloat(row.token_value_snapshot),
    resumed,
    buxTxSignature: row.bux_tx_signature,
  };
}

export async function prepareCashout(params: {
  userId: string;
  payoutWallet: string;
  amountBux: number;
}): Promise<PrepareCashoutResult> {
  if (!isLiquidityConfigured()) {
    throw new Error("Cashout is not available yet — liquidity wallet not configured");
  }

  const linked = await isWalletLinkedToUser(params.userId, params.payoutWallet);
  if (!linked) {
    throw new Error("Payout wallet must be linked to your Hub account");
  }

  const pool = getPool();
  const existing = await pool.query<PendingRow>(
    `SELECT payout_wallet, bux_amount_raw, sol_gross_lamports, fee_lamports, sol_net_lamports,
            token_value_snapshot, fee_bps, bux_tx_signature, created_at
     FROM cashout_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const existingRow = existing.rows[0];

  if (existingRow) {
    if (existingRow.payout_wallet !== params.payoutWallet) {
      throw new Error(
        "Cashout already in progress for another wallet. Complete it or wait a few minutes.",
      );
    }
    if (isPendingExpired(new Date(existingRow.created_at))) {
      await pool.query(`DELETE FROM cashout_pending_claims WHERE user_id = $1`, [params.userId]);
    } else {
      try {
        await assertQuoteStillValid(params.userId, existingRow);
        return rowToPrepareResult(existingRow, true);
      } catch {
        await pool.query(`DELETE FROM cashout_pending_claims WHERE user_id = $1`, [params.userId]);
      }
    }
  }

  await assertCashoutCooldownAllowed(params.userId);

  const [hasHolderNft, hasWhaleRole, feeBps, metrics, holdings] = await Promise.all([
    userHasHolderNft(params.userId),
    userHasWhaleRole(params.userId),
    getCashoutFeeBps(params.userId),
    fetchTokenMetrics(),
    fetchHubWalletHoldings(params.payoutWallet),
  ]);

  if (!hasHolderNft) {
    throw new Error("Hold at least one BUXDAO collection NFT in a linked wallet to cash out");
  }

  const tokenValue = metrics?.tokenValue ?? 0;
  if (tokenValue <= 0) {
    throw new Error("Token value unavailable — try again shortly");
  }

  const validationError = validateCashoutAmount({
    amountBux: params.amountBux,
    buxBalance: holdings.buxBalance,
    tokenValue,
    feeBps,
    hasWhaleRole,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  const amountRaw = buxToRaw(params.amountBux);
  const quote = quoteCashoutSol({ buxAmount: params.amountBux, tokenValue, feeBps });

  const lock = await acquireCashoutLock({
    userId: params.userId,
    payoutWallet: params.payoutWallet,
    buxAmountRaw: amountRaw,
    solGrossLamports: quote.solGrossLamports,
    feeLamports: quote.feeLamports,
    solNetLamports: quote.solNetLamports,
    tokenValueSnapshot: tokenValue,
    feeBps,
  });
  if (!lock.ok) {
    throw new Error(lock.error);
  }

  return {
    liquidityWallet: getLiquidityWallet(),
    mint: tokenConfig.mint,
    payoutWallet: params.payoutWallet,
    amountRaw: amountRaw.toString(),
    amountBux: params.amountBux,
    solGross: quote.solGross,
    feeSol: quote.feeSol,
    solNet: quote.solNet,
    feeBps,
    feePercent: feeBps / 100,
    tokenValue,
    resumed: false,
    buxTxSignature: null,
  };
}

export async function confirmCashout(params: {
  userId: string;
  payoutWallet: string;
  buxTxSignature: string;
}): Promise<{
  amountBux: number;
  solNet: number;
  feeSol: number;
  buxTxSignature: string;
  solTxSignature: string;
}> {
  if (!isValidTxSignature(params.buxTxSignature)) {
    throw new Error("Invalid transaction signature");
  }

  const pool = getPool();

  const completed = await loadCompletedByBuxTx(pool, params.buxTxSignature, params.userId);
  if (completed) {
    return mapCompletedRow(completed);
  }

  const resumed = await resumeProcessingCashout(params);
  if (resumed) {
    return resumed;
  }

  const used = await pool.query(`SELECT 1 FROM cashout_used_signatures WHERE tx_signature = $1`, [
    params.buxTxSignature,
  ]);
  if (used.rows.length > 0) {
    throw new Error("This $BUX transfer was already used for a cashout");
  }

  const pendingPreview = await pool.query<PendingRow>(
    `SELECT payout_wallet, bux_amount_raw, sol_gross_lamports, fee_lamports, sol_net_lamports,
            token_value_snapshot, fee_bps, bux_tx_signature, created_at
     FROM cashout_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const previewRow = pendingPreview.rows[0];
  if (!previewRow) {
    throw new Error("No cashout in progress — start again from the Hub");
  }
  if (previewRow.payout_wallet !== params.payoutWallet) {
    throw new Error("Payout wallet does not match the pending cashout");
  }

  await assertConfirmEligibility(params.userId, previewRow);

  const amountRaw = BigInt(previewRow.bux_amount_raw);

  await verifyBuxTransferToLiquidity({
    signature: params.buxTxSignature,
    fromWallet: params.payoutWallet,
    amountRaw,
  });

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const pending = await client.query<PendingRow>(
      `SELECT payout_wallet, bux_amount_raw, sol_gross_lamports, fee_lamports, sol_net_lamports,
              token_value_snapshot, fee_bps, bux_tx_signature, created_at
       FROM cashout_pending_claims
       WHERE user_id = $1
       FOR UPDATE`,
      [params.userId],
    );

    const row = pending.rows[0];
    if (!row) {
      throw new Error("No cashout in progress — start again from the Hub");
    }
    if (row.payout_wallet !== params.payoutWallet) {
      throw new Error("Payout wallet does not match the pending cashout");
    }
    if (
      row.bux_amount_raw !== previewRow.bux_amount_raw ||
      row.sol_net_lamports !== previewRow.sol_net_lamports
    ) {
      throw new Error("Cashout quote changed — start again from the Hub");
    }

    assertPendingFresh(new Date(row.created_at));

    await client.query(
      `INSERT INTO cashout_used_signatures (tx_signature, user_id) VALUES ($1, $2)`,
      [params.buxTxSignature, params.userId],
    );

    await client.query(
      `INSERT INTO cashout_transactions (
         user_id, wallet_address, bux_amount, sol_amount, fee_lamports,
         bux_tx_signature, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'processing')`,
      [
        params.userId,
        params.payoutWallet,
        row.bux_amount_raw,
        row.sol_net_lamports,
        row.fee_lamports,
        params.buxTxSignature,
      ],
    );

    await client.query(`DELETE FROM cashout_pending_claims WHERE user_id = $1`, [params.userId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate key") || message.includes("23505")) {
      const retry = await resumeProcessingCashout(params);
      if (retry) {
        return retry;
      }
      throw new Error("This $BUX transfer is already being processed");
    }
    throw error;
  } finally {
    client.release();
  }

  const paid = await resumeProcessingCashout(params);
  if (!paid) {
    throw new Error("Could not complete SOL payout — confirm again to retry");
  }

  return paid;
}

export async function cancelCashout(userId: string): Promise<void> {
  await releaseCashoutLock(userId);
}

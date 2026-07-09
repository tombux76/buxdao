import { getPool } from "@/lib/db";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import {
  buxRawToNumber,
  buxToRaw,
  getLiquidityWallet,
  isLiquidityConfigured,
  WHALE_REQUIRED_ABOVE_SOL_NET,
} from "@/lib/cashout/config";
import {
  getCashoutFeeBps,
  quoteCashoutSol,
  assertCashoutCooldownAllowed,
  userHasHolderNft,
  userHasWhaleRole,
  validateCashoutAmount,
} from "@/lib/cashout/eligibility";
import { acquireCashoutLock, assertPendingFresh, isPendingExpired, releaseCashoutLock } from "@/lib/cashout/lock";
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

  const [hasHolderNft, hasWhaleRole] = await Promise.all([
    userHasHolderNft(userId),
    userHasWhaleRole(userId),
  ]);

  if (!hasHolderNft) {
    throw new Error("Hold at least one BUXDAO collection NFT in a linked wallet to cash out");
  }

  const solNet = Number(BigInt(row.sol_net_lamports)) / 1e9;
  if (solNet > WHALE_REQUIRED_ABOVE_SOL_NET + 1e-9 && !hasWhaleRole) {
    throw new Error(
      `Cashouts above ${WHALE_REQUIRED_ABOVE_SOL_NET} SOL require a whale role in at least one collection.`,
    );
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
      return rowToPrepareResult(existingRow, true);
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

  const completed = await pool.query<CompletedCashoutRow>(
    `SELECT bux_amount, sol_amount, fee_lamports, bux_tx_signature, tx_signature
     FROM cashout_transactions
     WHERE bux_tx_signature = $1 AND status = 'completed'`,
    [params.buxTxSignature],
  );
  if (completed.rows[0]) {
    return mapCompletedRow(completed.rows[0]);
  }

  const processing = await pool.query<{
    id: string;
    wallet_address: string;
    bux_amount: string;
    sol_amount: string;
    fee_lamports: string;
    bux_tx_signature: string;
    tx_signature: string | null;
  }>(
    `SELECT id, wallet_address, bux_amount, sol_amount, fee_lamports, bux_tx_signature, tx_signature
     FROM cashout_transactions
     WHERE bux_tx_signature = $1 AND user_id = $2 AND status = 'processing'`,
    [params.buxTxSignature, params.userId],
  );
  const processingRow = processing.rows[0];
  if (processingRow) {
    if (processingRow.wallet_address !== params.payoutWallet) {
      throw new Error("Payout wallet does not match the pending cashout");
    }

    const amountBux = buxRawToNumber(BigInt(processingRow.bux_amount));
    const solNetLamports = BigInt(processingRow.sol_amount);
    const feeSol = Number(BigInt(processingRow.fee_lamports ?? "0")) / 1e9;

    if (processingRow.tx_signature) {
      await pool.query(
        `UPDATE cashout_transactions
         SET status = 'completed', completed_at = now()
         WHERE id = $1`,
        [processingRow.id],
      );
      return {
        amountBux,
        solNet: Number(solNetLamports) / 1e9,
        feeSol,
        buxTxSignature: processingRow.bux_tx_signature,
        solTxSignature: processingRow.tx_signature,
      };
    }

    await verifyBuxTransferToLiquidity({
      signature: params.buxTxSignature,
      fromWallet: params.payoutWallet,
      amountRaw: BigInt(processingRow.bux_amount),
    });

    const solTxSignature = await sendLiquiditySolTransfer({
      recipientWallet: params.payoutWallet,
      lamports: solNetLamports,
    });

    await pool.query(
      `UPDATE cashout_transactions
       SET tx_signature = $1, status = 'completed', completed_at = now()
       WHERE id = $2`,
      [solTxSignature, processingRow.id],
    );

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
  const solNetLamports = BigInt(previewRow.sol_net_lamports);
  const feeLamports = BigInt(previewRow.fee_lamports);

  await verifyBuxTransferToLiquidity({
    signature: params.buxTxSignature,
    fromWallet: params.payoutWallet,
    amountRaw,
  });

  const client = await pool.connect();
  let row = previewRow;

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

    row = pending.rows[0];
    if (!row) {
      throw new Error("No cashout in progress — start again from the Hub");
    }
    if (row.payout_wallet !== params.payoutWallet) {
      throw new Error("Payout wallet does not match the pending cashout");
    }
    if (row.bux_amount_raw !== previewRow.bux_amount_raw || row.sol_net_lamports !== previewRow.sol_net_lamports) {
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
      throw new Error("This $BUX transfer is already being processed");
    }
    throw error;
  } finally {
    client.release();
  }

  let solTxSignature: string;
  try {
    solTxSignature = await sendLiquiditySolTransfer({
      recipientWallet: params.payoutWallet,
      lamports: solNetLamports,
    });
  } catch (error) {
    console.error("[cashout] SOL payout failed after claim — retry confirm to resume:", error);
    throw error instanceof Error
      ? error
      : new Error("SOL payout failed — confirm again to retry");
  }

  await pool.query(
    `UPDATE cashout_transactions
     SET tx_signature = $1, status = 'completed', completed_at = now()
     WHERE bux_tx_signature = $2 AND user_id = $3 AND status = 'processing'`,
    [solTxSignature, params.buxTxSignature, params.userId],
  );

  const amountBux = buxRawToNumber(amountRaw);
  const solNet = Number(solNetLamports) / 1e9;
  const feeSol = Number(feeLamports) / 1e9;

  await announceCashoutIfNeeded({
    userId: params.userId,
    payoutWallet: params.payoutWallet,
    amountBux,
    solNet,
    buxTxSignature: params.buxTxSignature,
    solTxSignature,
  });

  return {
    amountBux,
    solNet,
    feeSol,
    buxTxSignature: params.buxTxSignature,
    solTxSignature,
  };
}

export async function cancelCashout(userId: string): Promise<void> {
  await releaseCashoutLock(userId);
}

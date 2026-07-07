import { getPool } from "@/lib/db";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import {
  buxRawToNumber,
  buxToRaw,
  getLiquidityWallet,
  isLiquidityConfigured,
} from "@/lib/cashout/config";
import {
  getCashoutEligibility,
  getCashoutFeeBps,
  quoteCashoutSol,
  userHasHolderNft,
  userHasWhaleRole,
  validateCashoutAmount,
} from "@/lib/cashout/eligibility";
import { acquireCashoutLock, releaseCashoutLock } from "@/lib/cashout/lock";
import { verifyBuxTransferToLiquidity } from "@/lib/cashout/verify-transfer";
import { sendLiquiditySolTransfer } from "@/lib/solana/liquidity";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";
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
};

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
            token_value_snapshot, fee_bps, bux_tx_signature
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
    return rowToPrepareResult(existingRow, true);
  }

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

  const completed = await pool.query<{
    bux_amount_raw: string;
    sol_amount: string;
    fee_lamports: string;
    bux_tx_signature: string;
    tx_signature: string;
  }>(
    `SELECT bux_amount_raw, sol_amount, fee_lamports, bux_tx_signature, tx_signature
     FROM cashout_transactions
     WHERE bux_tx_signature = $1 AND status = 'completed'`,
    [params.buxTxSignature],
  );
  if (completed.rows[0]) {
    const row = completed.rows[0];
    return {
      amountBux: buxRawToNumber(BigInt(row.bux_amount_raw)),
      solNet: Number(BigInt(row.sol_amount ?? "0")) / 1e9,
      feeSol: Number(BigInt(row.fee_lamports ?? "0")) / 1e9,
      buxTxSignature: row.bux_tx_signature,
      solTxSignature: row.tx_signature,
    };
  }

  const used = await pool.query(`SELECT 1 FROM cashout_used_signatures WHERE tx_signature = $1`, [
    params.buxTxSignature,
  ]);
  if (used.rows.length > 0) {
    throw new Error("This $BUX transfer was already used for a cashout");
  }

  const pending = await pool.query<PendingRow>(
    `SELECT payout_wallet, bux_amount_raw, sol_gross_lamports, fee_lamports, sol_net_lamports,
            token_value_snapshot, fee_bps, bux_tx_signature
     FROM cashout_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const row = pending.rows[0];
  if (!row) {
    throw new Error("No cashout in progress — start again from the Hub");
  }
  if (row.payout_wallet !== params.payoutWallet) {
    throw new Error("Payout wallet does not match the pending cashout");
  }

  const amountRaw = BigInt(row.bux_amount_raw);
  const solNetLamports = BigInt(row.sol_net_lamports);
  const feeLamports = BigInt(row.fee_lamports);

  await verifyBuxTransferToLiquidity({
    signature: params.buxTxSignature,
    fromWallet: params.payoutWallet,
    amountRaw,
  });

  const solTxSignature = await sendLiquiditySolTransfer({
    recipientWallet: params.payoutWallet,
    lamports: solNetLamports,
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO cashout_used_signatures (tx_signature, user_id) VALUES ($1, $2)`,
      [params.buxTxSignature, params.userId],
    );

    await client.query(
      `INSERT INTO cashout_transactions (
         user_id, wallet_address, bux_amount, sol_amount, fee_lamports,
         bux_tx_signature, tx_signature, status, completed_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'completed', now())`,
      [
        params.userId,
        params.payoutWallet,
        row.bux_amount_raw,
        row.sol_net_lamports,
        row.fee_lamports,
        params.buxTxSignature,
        solTxSignature,
      ],
    );

    await client.query(`DELETE FROM cashout_pending_claims WHERE user_id = $1`, [params.userId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    amountBux: buxRawToNumber(amountRaw),
    solNet: Number(solNetLamports) / 1e9,
    feeSol: Number(feeLamports) / 1e9,
    buxTxSignature: params.buxTxSignature,
    solTxSignature,
  };
}

export async function cancelCashout(userId: string): Promise<void> {
  await releaseCashoutLock(userId);
}

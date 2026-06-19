import { PublicKey } from "@solana/web3.js";
import { getPool } from "@/lib/db";
import {
  buxRawToWholeBux,
  getTreasuryWallet,
  HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
} from "@/lib/holder-rewards/config";
import { acquireClaimLock, releaseClaimLock } from "@/lib/holder-rewards/claim-lock";
import { getRewardAccount } from "@/lib/holder-rewards/accounts";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";
import { withServerConnection } from "@/lib/solana/server-rpc";
import { sendTreasuryBuxRawTransfer } from "@/lib/solana/treasury";

const CLAIM_ADVISORY_NAMESPACE = 847291;

export type PrepareClaimResult = {
  treasuryWallet: string;
  payoutWallet: string;
  amountRaw: string;
  amountBux: number;
  feeLamports: number;
  feeSol: number;
  resumed: boolean;
  feePaid: boolean;
  feeTxSignature: string | null;
};

function isValidTxSignature(signature: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(signature);
}

async function syncPendingAmountBeforeFee(userId: string, payoutWallet: string): Promise<bigint> {
  const account = await getRewardAccount(userId);
  if (account.unclaimedBalanceRaw <= BigInt(0)) {
    throw new Error("No unclaimed rewards available");
  }

  await getPool().query(
    `UPDATE holder_reward_pending_claims
     SET amount_raw = $2
     WHERE user_id = $1 AND payout_wallet = $3 AND fee_tx_signature IS NULL`,
    [userId, account.unclaimedBalanceRaw.toString(), payoutWallet],
  );

  return account.unclaimedBalanceRaw;
}

export async function prepareHolderRewardClaim(params: {
  userId: string;
  payoutWallet: string;
}): Promise<PrepareClaimResult> {
  const linked = await isWalletLinkedToUser(params.userId, params.payoutWallet);
  if (!linked) {
    throw new Error("Payout wallet must be linked to your Hub account");
  }

  const treasuryWallet = getTreasuryWallet();
  if (!treasuryWallet) {
    throw new Error("Treasury wallet is not configured");
  }

  const pool = getPool();
  const existing = await pool.query<{
    amount_raw: string;
    payout_wallet: string;
    fee_tx_signature: string | null;
  }>(
    `SELECT amount_raw, payout_wallet, fee_tx_signature
     FROM holder_reward_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const existingRow = existing.rows[0];

  if (existingRow) {
    if (existingRow.payout_wallet !== params.payoutWallet) {
      throw new Error(
        "Claim already in progress for another wallet. Complete it or wait a few minutes.",
      );
    }

    const amountRaw = existingRow.fee_tx_signature
      ? BigInt(existingRow.amount_raw)
      : await syncPendingAmountBeforeFee(params.userId, params.payoutWallet);

    const refreshed = await pool.query<{ fee_tx_signature: string | null; amount_raw: string }>(
      `SELECT fee_tx_signature, amount_raw FROM holder_reward_pending_claims WHERE user_id = $1`,
      [params.userId],
    );
    const row = refreshed.rows[0] ?? existingRow;

    return {
      treasuryWallet,
      payoutWallet: params.payoutWallet,
      amountRaw: row.amount_raw,
      amountBux: buxRawToWholeBux(BigInt(row.amount_raw)),
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
      feeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
      resumed: true,
      feePaid: Boolean(row.fee_tx_signature),
      feeTxSignature: row.fee_tx_signature,
    };
  }

  const account = await getRewardAccount(params.userId);
  if (account.unclaimedBalanceRaw <= BigInt(0)) {
    throw new Error("No unclaimed rewards available");
  }

  const lock = await acquireClaimLock(
    params.userId,
    params.payoutWallet,
    account.unclaimedBalanceRaw,
  );
  if (!lock.ok) {
    throw new Error(lock.error);
  }

  return {
    treasuryWallet,
    payoutWallet: params.payoutWallet,
    amountRaw: account.unclaimedBalanceRaw.toString(),
    amountBux: buxRawToWholeBux(account.unclaimedBalanceRaw),
    feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
    feeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
    resumed: false,
    feePaid: false,
    feeTxSignature: null,
  };
}

async function verifyFeeTransaction(params: {
  signature: string;
  payoutWallet: string;
  feeLamports: number;
}): Promise<void> {
  const treasuryWallet = getTreasuryWallet();
  if (!treasuryWallet) {
    throw new Error("Server configuration error");
  }

  await withServerConnection(async (connection) => {
    const tx = await connection.getParsedTransaction(params.signature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx?.meta || tx.meta.err) {
      throw new Error("Fee transaction not found or failed");
    }

    const feePayer = tx.transaction.message.accountKeys[0];
    const feePayerAddress =
      typeof feePayer === "object" && feePayer !== null && "pubkey" in feePayer
        ? (feePayer as { pubkey: PublicKey }).pubkey.toBase58()
        : String(feePayer);
    if (feePayerAddress !== params.payoutWallet) {
      throw new Error("Fee transaction must be signed by the payout wallet");
    }

    let solFeePaid = false;

    const topLevel = tx.transaction.message.instructions;
    for (const ix of topLevel) {
      if (!("parsed" in ix) || !ix.parsed) {
        continue;
      }
      const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
      if (parsed.type !== "transfer" || !parsed.info) {
        continue;
      }
      const info = parsed.info;
      const source = String(info.source ?? "");
      const destination = String(info.destination ?? "");
      const lamports = Number(info.lamports ?? 0);
      if (
        source === params.payoutWallet &&
        destination === treasuryWallet &&
        lamports === params.feeLamports
      ) {
        solFeePaid = true;
        break;
      }
    }

    if (!solFeePaid) {
      throw new Error(
        "Claim fee not verified. Send the exact fee amount in SOL to the treasury wallet from your linked wallet.",
      );
    }
  });
}

async function waitForSignatureConfirmation(signature: string): Promise<void> {
  await withServerConnection(async (connection) => {
    let status = null;
    let retries = 8;
    let waitTime = 1000;

    while (retries > 0) {
      status = await connection.getSignatureStatus(signature);
      if (status?.value) {
        break;
      }
      retries -= 1;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime = Math.floor(waitTime * 1.5);
      }
    }

    if (!status?.value) {
      throw new Error("Fee transaction not found yet. Try again in a few seconds.");
    }
    if (status.value.err) {
      throw new Error("Fee transaction failed on-chain");
    }
    if (!status.value.confirmationStatus || status.value.confirmationStatus === "processed") {
      throw new Error("Fee transaction still processing");
    }
  });
}

function isPermanentFeeError(message: string): boolean {
  return (
    message.includes("failed on-chain") ||
    message.includes("not verified") ||
    message.includes("must be signed") ||
    message.includes("Invalid fee")
  );
}

async function findCompletedClaimByFee(feeSignature: string) {
  const { rows } = await getPool().query<{
    amount_raw: string;
    tx_signature: string;
    fee_tx_signature: string;
  }>(
    `SELECT amount_raw, tx_signature, fee_tx_signature
     FROM holder_reward_claims WHERE fee_tx_signature = $1`,
    [feeSignature],
  );
  return rows[0] ?? null;
}

export async function recordPendingClaimFee(params: {
  userId: string;
  payoutWallet: string;
  feeSignature: string;
}): Promise<void> {
  if (!isValidTxSignature(params.feeSignature)) {
    throw new Error("Invalid transaction signature format");
  }

  const pool = getPool();
  const account = await getRewardAccount(params.userId);

  const result = await pool.query(
    `UPDATE holder_reward_pending_claims
     SET fee_tx_signature = $3,
         amount_raw = $4
     WHERE user_id = $1 AND payout_wallet = $2 AND fee_tx_signature IS NULL
     RETURNING user_id`,
    [
      params.userId,
      params.payoutWallet,
      params.feeSignature,
      account.unclaimedBalanceRaw.toString(),
    ],
  );

  if (result.rowCount === 0) {
    const existing = await pool.query<{ fee_tx_signature: string | null }>(
      `SELECT fee_tx_signature FROM holder_reward_pending_claims WHERE user_id = $1`,
      [params.userId],
    );
    if (!existing.rows[0]) {
      throw new Error("No pending claim");
    }
    if (
      existing.rows[0].fee_tx_signature &&
      existing.rows[0].fee_tx_signature !== params.feeSignature
    ) {
      throw new Error("A different fee transaction is already recorded for this claim");
    }
  }
}

export async function confirmHolderRewardClaim(params: {
  userId: string;
  payoutWallet: string;
  feeSignature: string;
}): Promise<{ amountBux: number; feeTxSignature: string; buxTxSignature: string }> {
  if (!isValidTxSignature(params.feeSignature)) {
    throw new Error("Invalid fee transaction signature");
  }

  const linked = await isWalletLinkedToUser(params.userId, params.payoutWallet);
  if (!linked) {
    throw new Error("Payout wallet must be linked to your Hub account");
  }

  const existing = await findCompletedClaimByFee(params.feeSignature);
  if (existing) {
    return {
      amountBux: buxRawToWholeBux(BigInt(existing.amount_raw)),
      feeTxSignature: existing.fee_tx_signature,
      buxTxSignature: existing.tx_signature,
    };
  }

  const pool = getPool();
  const client = await pool.connect();
  const userIdNum = Number.parseInt(params.userId, 10);

  try {
    await client.query("SELECT pg_advisory_lock($1, $2)", [CLAIM_ADVISORY_NAMESPACE, userIdNum]);

    const pending = await client.query<{
      amount_raw: string;
      payout_wallet: string;
      fee_tx_signature: string | null;
    }>(
      `SELECT amount_raw, payout_wallet, fee_tx_signature
       FROM holder_reward_pending_claims WHERE user_id = $1`,
      [params.userId],
    );
    const pendingRow = pending.rows[0];
    if (!pendingRow) {
      throw new Error("No pending claim found. Start a new claim.");
    }
    if (pendingRow.payout_wallet !== params.payoutWallet) {
      throw new Error("Payout wallet does not match pending claim");
    }
    if (pendingRow.fee_tx_signature && pendingRow.fee_tx_signature !== params.feeSignature) {
      throw new Error("Fee signature does not match the recorded claim payment");
    }

    const usedFee = await client.query(
      `SELECT 1 FROM holder_reward_used_tx_signatures WHERE tx_signature = $1`,
      [params.feeSignature],
    );
    if (usedFee.rows.length > 0) {
      const completed = await findCompletedClaimByFee(params.feeSignature);
      if (completed) {
        return {
          amountBux: buxRawToWholeBux(BigInt(completed.amount_raw)),
          feeTxSignature: completed.fee_tx_signature,
          buxTxSignature: completed.tx_signature,
        };
      }
      throw new Error("This claim was already completed.");
    }

    const amountRaw = BigInt(pendingRow.amount_raw);
    if (amountRaw <= BigInt(0)) {
      throw new Error("Invalid claim amount");
    }

    await waitForSignatureConfirmation(params.feeSignature);
    await verifyFeeTransaction({
      signature: params.feeSignature,
      payoutWallet: params.payoutWallet,
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
    });

    await client.query(
      `UPDATE holder_reward_pending_claims SET fee_tx_signature = $2 WHERE user_id = $1 AND fee_tx_signature IS NULL`,
      [params.userId, params.feeSignature],
    );

    const accountCheck = await getRewardAccount(params.userId);
    if (accountCheck.unclaimedBalanceRaw < amountRaw) {
      throw new Error("Insufficient unclaimed balance");
    }

    const buxTxSignature = await sendTreasuryBuxRawTransfer({
      recipientWallet: params.payoutWallet,
      amountRaw,
    });

    try {
      await client.query("BEGIN");

      const accountRes = await client.query<{ unclaimed_balance_raw: string }>(
        `SELECT unclaimed_balance_raw FROM holder_reward_accounts WHERE user_id = $1 FOR UPDATE`,
        [params.userId],
      );
      const currentRaw = BigInt(accountRes.rows[0]?.unclaimed_balance_raw ?? "0");
      if (currentRaw < amountRaw) {
        throw new Error("Insufficient unclaimed balance");
      }

      await client.query(
        `UPDATE holder_reward_accounts
         SET unclaimed_balance_raw = unclaimed_balance_raw - $2,
             total_claimed_raw = total_claimed_raw + $2,
             updated_at = now()
         WHERE user_id = $1`,
        [params.userId, amountRaw.toString()],
      );

      await client.query(
        `INSERT INTO holder_reward_claims (user_id, payout_wallet, amount_raw, fee_lamports, tx_signature, fee_tx_signature)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          params.userId,
          params.payoutWallet,
          amountRaw.toString(),
          HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
          buxTxSignature,
          params.feeSignature,
        ],
      );

      await client.query(
        `INSERT INTO holder_reward_used_tx_signatures (tx_signature, user_id) VALUES ($1, $2)`,
        [params.feeSignature, params.userId],
      );
      await client.query(
        `INSERT INTO holder_reward_used_tx_signatures (tx_signature, user_id) VALUES ($1, $2)`,
        [buxTxSignature, params.userId],
      );

      await client.query(`DELETE FROM holder_reward_pending_claims WHERE user_id = $1`, [
        params.userId,
      ]);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    return {
      amountBux: buxRawToWholeBux(amountRaw),
      feeTxSignature: params.feeSignature,
      buxTxSignature,
    };
  } finally {
    await client.query("SELECT pg_advisory_unlock($1, $2)", [
      CLAIM_ADVISORY_NAMESPACE,
      userIdNum,
    ]);
    client.release();
  }
}

export async function cancelPendingClaim(userId: string): Promise<void> {
  const pool = getPool();
  const pending = await pool.query<{ fee_tx_signature: string | null }>(
    `SELECT fee_tx_signature FROM holder_reward_pending_claims WHERE user_id = $1`,
    [userId],
  );
  if (pending.rows[0]?.fee_tx_signature) {
    throw new Error("Cannot cancel — claim fee already paid. Complete the payout instead.");
  }
  await releaseClaimLock(userId);
}

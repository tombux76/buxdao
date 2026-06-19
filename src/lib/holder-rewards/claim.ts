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

async function syncPendingAmount(userId: string, payoutWallet: string): Promise<bigint> {
  const account = await getRewardAccount(userId);
  if (account.unclaimedBalanceRaw <= BigInt(0)) {
    throw new Error("No unclaimed rewards available");
  }

  await getPool().query(
    `UPDATE holder_reward_pending_claims
     SET amount_raw = $2
     WHERE user_id = $1 AND payout_wallet = $3`,
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

    const amountRaw = await syncPendingAmount(params.userId, params.payoutWallet);
    const refreshed = await pool.query<{ fee_tx_signature: string | null }>(
      `SELECT fee_tx_signature FROM holder_reward_pending_claims WHERE user_id = $1`,
      [params.userId],
    );
    const feeTxSignature = refreshed.rows[0]?.fee_tx_signature ?? existingRow.fee_tx_signature;

    return {
      treasuryWallet,
      payoutWallet: params.payoutWallet,
      amountRaw: amountRaw.toString(),
      amountBux: buxRawToWholeBux(amountRaw),
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
      feeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
      resumed: true,
      feePaid: Boolean(feeTxSignature),
      feeTxSignature,
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
      const accountKeys = tx.transaction.message.accountKeys;
      let treasuryIndex = -1;
      let payerIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        const key = accountKeys[i];
        const pubkey =
          typeof key === "object" && key !== null && "pubkey" in key
            ? (key as { pubkey: PublicKey }).pubkey.toBase58()
            : String(key);
        if (pubkey === treasuryWallet) {
          treasuryIndex = i;
        }
        if (pubkey === params.payoutWallet) {
          payerIndex = i;
        }
      }
      if (treasuryIndex >= 0 && payerIndex >= 0) {
        const treasuryReceived =
          (tx.meta.postBalances[treasuryIndex] ?? 0) - (tx.meta.preBalances[treasuryIndex] ?? 0);
        const payerSent =
          (tx.meta.preBalances[payerIndex] ?? 0) - (tx.meta.postBalances[payerIndex] ?? 0);
        if (treasuryReceived >= params.feeLamports && payerSent >= params.feeLamports) {
          solFeePaid = true;
        }
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
    message.includes("Invalid fee")
  );
}

async function recordPendingFeeSignature(userId: string, feeSignature: string): Promise<void> {
  await getPool().query(
    `UPDATE holder_reward_pending_claims
     SET fee_tx_signature = $2
     WHERE user_id = $1 AND fee_tx_signature IS NULL`,
    [userId, feeSignature],
  );
}

export async function confirmHolderRewardClaim(params: {
  userId: string;
  payoutWallet: string;
  feeSignature: string;
}): Promise<{ amountBux: number; feeTxSignature: string; buxTxSignature: string }> {
  if (!params.feeSignature || params.feeSignature.length < 80) {
    throw new Error("Invalid fee transaction signature");
  }

  const pool = getPool();

  const pending = await pool.query<{
    amount_raw: string;
    payout_wallet: string;
    fee_tx_signature: string | null;
  }>(
    `SELECT amount_raw, payout_wallet, fee_tx_signature FROM holder_reward_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const pendingRow = pending.rows[0];
  if (!pendingRow) {
    throw new Error("No pending claim found. Start a new claim.");
  }
  if (pendingRow.payout_wallet !== params.payoutWallet) {
    throw new Error("Payout wallet does not match pending claim");
  }

  const usedFee = await pool.query(
    `SELECT 1 FROM holder_reward_used_tx_signatures WHERE tx_signature = $1`,
    [params.feeSignature],
  );
  if (usedFee.rows.length > 0) {
    throw new Error("This claim was already completed.");
  }

  await recordPendingFeeSignature(params.userId, params.feeSignature);

  const amountRaw = await syncPendingAmount(params.userId, params.payoutWallet);

  try {
    await waitForSignatureConfirmation(params.feeSignature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isPermanentFeeError(message)) {
      await releaseClaimLock(params.userId);
    }
    throw error;
  }

  try {
    await verifyFeeTransaction({
      signature: params.feeSignature,
      payoutWallet: params.payoutWallet,
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (isPermanentFeeError(message)) {
      await releaseClaimLock(params.userId);
    }
    throw error;
  }

  const buxTxSignature = await sendTreasuryBuxRawTransfer({
    recipientWallet: params.payoutWallet,
    amountRaw,
  });

  const client = await pool.connect();
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
      `INSERT INTO holder_reward_claims (user_id, payout_wallet, amount_raw, fee_lamports, tx_signature)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        params.userId,
        params.payoutWallet,
        amountRaw.toString(),
        HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
        buxTxSignature,
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

    await client.query(`DELETE FROM holder_reward_pending_claims WHERE user_id = $1`, [params.userId]);

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    amountBux: buxRawToWholeBux(amountRaw),
    feeTxSignature: params.feeSignature,
    buxTxSignature,
  };
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

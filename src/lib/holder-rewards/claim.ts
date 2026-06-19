import { Connection, PublicKey } from "@solana/web3.js";
import { getPool } from "@/lib/db";
import {
  buxRawToNumber,
  getTreasuryWallet,
  HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
} from "@/lib/holder-rewards/config";
import { acquireClaimLock, releaseClaimLock } from "@/lib/holder-rewards/claim-lock";
import { getRewardAccount } from "@/lib/holder-rewards/accounts";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";
import { sendTreasuryBuxRawTransfer } from "@/lib/solana/treasury";

function getRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : "https://api.mainnet-beta.solana.com")
  );
}

export type PrepareClaimResult = {
  treasuryWallet: string;
  payoutWallet: string;
  amountRaw: string;
  amountBux: number;
  feeLamports: number;
  feeSol: number;
  resumed: boolean;
};

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
  const existing = await pool.query<{ amount_raw: string; payout_wallet: string }>(
    `SELECT amount_raw, payout_wallet FROM holder_reward_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const existingRow = existing.rows[0];
  if (existingRow) {
    if (existingRow.payout_wallet !== params.payoutWallet) {
      throw new Error(
        "Claim already in progress for another wallet. Complete it or wait a few minutes.",
      );
    }
    const amountRaw = BigInt(existingRow.amount_raw);
    return {
      treasuryWallet,
      payoutWallet: params.payoutWallet,
      amountRaw: amountRaw.toString(),
      amountBux: buxRawToNumber(amountRaw),
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
      feeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
      resumed: true,
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
    amountBux: buxRawToNumber(account.unclaimedBalanceRaw),
    feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
    feeSol: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS / 1e9,
    resumed: false,
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

  const connection = new Connection(getRpcUrl(), "confirmed");
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
}

async function waitForSignatureConfirmation(signature: string): Promise<void> {
  const connection = new Connection(getRpcUrl(), "confirmed");
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
  const usedFee = await pool.query(
    `SELECT 1 FROM holder_reward_used_tx_signatures WHERE tx_signature = $1`,
    [params.feeSignature],
  );
  if (usedFee.rows.length > 0) {
    throw new Error("Fee transaction signature already used");
  }

  const pending = await pool.query<{ amount_raw: string; payout_wallet: string }>(
    `SELECT amount_raw, payout_wallet FROM holder_reward_pending_claims WHERE user_id = $1`,
    [params.userId],
  );
  const pendingRow = pending.rows[0];
  if (!pendingRow) {
    throw new Error("No pending claim found. Start a new claim.");
  }
  if (pendingRow.payout_wallet !== params.payoutWallet) {
    throw new Error("Payout wallet does not match pending claim");
  }

  const amountRaw = BigInt(pendingRow.amount_raw);

  try {
    await waitForSignatureConfirmation(params.feeSignature);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("failed on-chain")) {
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
    await releaseClaimLock(params.userId);
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
    amountBux: buxRawToNumber(amountRaw),
    feeTxSignature: params.feeSignature,
    buxTxSignature,
  };
}

export async function cancelPendingClaim(userId: string): Promise<void> {
  await releaseClaimLock(userId);
}

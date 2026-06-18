import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getPool } from "@/lib/db";
import {
  buxRawToNumber,
  getProjectWallet,
  HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
} from "@/lib/holder-rewards/config";
import { acquireClaimLock, releaseClaimLock } from "@/lib/holder-rewards/claim-lock";
import { getRewardAccount } from "@/lib/holder-rewards/accounts";
import { isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";

function loadKeypairFromSecret(secret: string): Keypair {
  if (secret.startsWith("[")) {
    const bytes = JSON.parse(secret) as number[];
    if (!Array.isArray(bytes) || bytes.length !== 64) {
      throw new Error("Invalid treasury private key array");
    }
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  const decoded = bs58.decode(secret);
  if (decoded.length !== 64) {
    throw new Error("Invalid treasury private key length");
  }
  return Keypair.fromSecretKey(decoded);
}

function getRpcUrl(): string {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY)}`
      : "https://api.mainnet-beta.solana.com")
  );
}

export async function prepareHolderRewardClaim(params: {
  userId: string;
  payoutWallet: string;
}): Promise<{ transaction: string; amountRaw: string; amountBux: number; feeLamports: number }> {
  const linked = await isWalletLinkedToUser(params.userId, params.payoutWallet);
  if (!linked) {
    throw new Error("Payout wallet must be linked to your Hub account");
  }

  const account = await getRewardAccount(params.userId);
  if (account.unclaimedBalanceRaw <= BigInt(0)) {
    throw new Error("No unclaimed rewards available");
  }

  const projectWallet = getProjectWallet();
  if (!projectWallet) {
    throw new Error("PROJECT_WALLET is not configured");
  }

  const treasuryWallet = process.env.TREASURY_WALLET?.trim();
  const treasuryPrivateKey = process.env.TREASURY_PRIVATE_KEY?.trim();
  const mintAddress = process.env.BUX_TOKEN_MINT?.trim();
  if (!treasuryWallet || !treasuryPrivateKey || !mintAddress) {
    throw new Error("Treasury or BUX token is not configured");
  }

  const lock = await acquireClaimLock(
    params.userId,
    params.payoutWallet,
    account.unclaimedBalanceRaw,
  );
  if (!lock.ok) {
    throw new Error(lock.error);
  }

  try {
    const treasuryKeypair = loadKeypairFromSecret(treasuryPrivateKey);
    if (treasuryKeypair.publicKey.toBase58() !== treasuryWallet) {
      throw new Error("Treasury key mismatch");
    }

    const connection = new Connection(getRpcUrl(), "confirmed");
    const mint = new PublicKey(mintAddress);
    const userPublicKey = new PublicKey(params.payoutWallet);
    const treasuryPublicKey = treasuryKeypair.publicKey;
    const projectPublicKey = new PublicKey(projectWallet);

    const userTokenAccount = await getAssociatedTokenAddress(mint, userPublicKey);
    const treasuryTokenAccount = await getAssociatedTokenAddress(mint, treasuryPublicKey);
    const transferAmount = account.unclaimedBalanceRaw;

    const treasuryAccount = await getAccount(connection, treasuryTokenAccount);
    if (treasuryAccount.amount < transferAmount) {
      throw new Error("Treasury has insufficient $BUX for this claim");
    }

    const transaction = new Transaction();

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: projectPublicKey,
        lamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
      }),
    );

    let userAccountExists = false;
    try {
      await getAccount(connection, userTokenAccount);
      userAccountExists = true;
    } catch {
      userAccountExists = false;
    }

    if (!userAccountExists) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPublicKey,
          userTokenAccount,
          userPublicKey,
          mint,
        ),
      );
    }

    transaction.add(
      createTransferInstruction(
        treasuryTokenAccount,
        userTokenAccount,
        treasuryPublicKey,
        transferAmount,
      ),
    );

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;
    transaction.partialSign(treasuryKeypair);

    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return {
      transaction: Buffer.from(serialized).toString("base64"),
      amountRaw: transferAmount.toString(),
      amountBux: buxRawToNumber(transferAmount),
      feeLamports: HOLDER_REWARDS_CLAIM_FEE_LAMPORTS,
    };
  } catch (error) {
    await releaseClaimLock(params.userId);
    throw error;
  }
}

async function verifyClaimTransaction(params: {
  signature: string;
  payoutWallet: string;
  expectedAmountRaw: bigint;
}): Promise<void> {
  const treasuryWallet = process.env.TREASURY_WALLET?.trim();
  const mintAddress = process.env.BUX_TOKEN_MINT?.trim();
  const projectWallet = getProjectWallet();
  if (!treasuryWallet || !mintAddress || !projectWallet) {
    throw new Error("Server configuration error");
  }

  const connection = new Connection(getRpcUrl(), "confirmed");
  const tx = await connection.getParsedTransaction(params.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: "confirmed",
  });

  if (!tx?.meta || tx.meta.err) {
    throw new Error("Transaction not found or failed");
  }

  const meta = tx.meta;
  let solFeePaid = false;
  let buxTransferred = false;

  const instructions = tx.transaction.message.instructions;
  for (const ix of instructions) {
    if (!("parsed" in ix) || !ix.parsed) {
      continue;
    }
    const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
    if (parsed.type === "transfer" && parsed.info) {
      const info = parsed.info;
      const source = String(info.source ?? "");
      const destination = String(info.destination ?? "");
      const lamports = Number(info.lamports ?? 0);
      if (
        source === params.payoutWallet &&
        destination === projectWallet &&
        lamports === HOLDER_REWARDS_CLAIM_FEE_LAMPORTS
      ) {
        solFeePaid = true;
      }
    }
  }

  const innerInstructions = meta.innerInstructions ?? [];
  for (const inner of innerInstructions) {
    for (const ix of inner.instructions) {
      if (!("parsed" in ix) || !ix.parsed) {
        continue;
      }
      const parsed = ix.parsed as { type?: string; info?: Record<string, unknown> };
      if (parsed.type === "transferChecked" || parsed.type === "transfer") {
        const info = parsed.info;
        if (!info) {
          continue;
        }
        const authority = String(info.authority ?? info.owner ?? "");
        const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
        const amount = BigInt(String(info.amount ?? tokenAmount?.amount ?? "0"));
        if (authority === treasuryWallet && amount === params.expectedAmountRaw) {
          buxTransferred = true;
        }
      }
    }
  }

  if (!meta.preTokenBalances || !meta.postTokenBalances) {
    throw new Error("Could not verify token transfer");
  }

  if (!buxTransferred) {
    for (const post of meta.postTokenBalances) {
      if (post.mint !== mintAddress || post.owner !== params.payoutWallet) {
        continue;
      }
      const pre = meta.preTokenBalances.find((p) => p.accountIndex === post.accountIndex);
      const preAmt = BigInt(pre?.uiTokenAmount.amount ?? "0");
      const postAmt = BigInt(post.uiTokenAmount.amount ?? "0");
      if (postAmt - preAmt === params.expectedAmountRaw) {
        buxTransferred = true;
        break;
      }
    }
  }

  if (!solFeePaid) {
    throw new Error("Platform fee transfer not verified");
  }
  if (!buxTransferred) {
    throw new Error("BUX payout not verified");
  }
}

export async function confirmHolderRewardClaim(params: {
  userId: string;
  payoutWallet: string;
  signature: string;
}): Promise<{ amountBux: number; txSignature: string }> {
  if (!params.signature || params.signature.length < 80) {
    throw new Error("Invalid transaction signature");
  }

  const pool = getPool();
  const used = await pool.query(`SELECT 1 FROM holder_reward_used_tx_signatures WHERE tx_signature = $1`, [
    params.signature,
  ]);
  if (used.rows.length > 0) {
    throw new Error("Transaction signature already used");
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

  const connection = new Connection(getRpcUrl(), "confirmed");
  let status = null;
  let retries = 5;
  let waitTime = 1000;
  while (retries > 0) {
    status = await connection.getSignatureStatus(params.signature);
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
    throw new Error("Transaction not found yet. Try again in a few seconds.");
  }
  if (status.value.err) {
    await releaseClaimLock(params.userId);
    throw new Error("Transaction failed on-chain");
  }
  if (!status.value.confirmationStatus || status.value.confirmationStatus === "processed") {
    throw new Error("Transaction still processing");
  }

  await verifyClaimTransaction({
    signature: params.signature,
    payoutWallet: params.payoutWallet,
    expectedAmountRaw: amountRaw,
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
        params.signature,
      ],
    );

    await client.query(
      `INSERT INTO holder_reward_used_tx_signatures (tx_signature, user_id) VALUES ($1, $2)`,
      [params.signature, params.userId],
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
    txSignature: params.signature,
  };
}

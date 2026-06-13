import { randomBytes } from "node:crypto";
import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { getPool } from "@/lib/db";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

export type LinkedWallet = {
  address: string;
  isPrimary: boolean;
  linkedAt: string;
};

export function buildWalletLinkMessage(params: {
  walletAddress: string;
  nonce: string;
  expiresAt: Date;
}): string {
  return [
    "Link this wallet to your BUXDAO account.",
    "",
    `Wallet: ${params.walletAddress}`,
    `Nonce: ${params.nonce}`,
    `Expires: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}

export async function createWalletLinkChallenge(userId: string, walletAddress: string) {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(walletAddress);
  } catch {
    throw new Error("Invalid wallet address");
  }

  const normalized = pubkey.toBase58();
  const nonce = randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = buildWalletLinkMessage({ walletAddress: normalized, nonce, expiresAt });

  await getPool().query(
    `INSERT INTO wallet_link_challenges (user_id, nonce, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, nonce, expiresAt.toISOString()],
  );

  return { nonce, message, expiresAt: expiresAt.toISOString() };
}

function verifyWalletSignature(
  message: string,
  signatureBase64: string,
  walletAddress: string,
): boolean {
  try {
    const pubkey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signatureBase64, "base64");
    if (signatureBytes.length !== 64) {
      return false;
    }
    return nacl.sign.detached.verify(messageBytes, signatureBytes, pubkey.toBytes());
  } catch {
    return false;
  }
}

export async function linkWalletToUser(
  userId: string,
  walletAddress: string,
  nonce: string,
  signatureBase64: string,
  signedMessage: string,
): Promise<LinkedWallet> {
  let pubkey: PublicKey;
  try {
    pubkey = new PublicKey(walletAddress);
  } catch {
    throw new Error("Invalid wallet address");
  }

  const normalized = pubkey.toBase58();
  const pool = getPool();

  const challengeResult = await pool.query<{
    id: number;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT id, expires_at, used_at FROM wallet_link_challenges
     WHERE user_id = $1 AND nonce = $2`,
    [userId, nonce],
  );

  const challenge = challengeResult.rows[0];
  if (!challenge) {
    throw new Error("Invalid or expired link challenge");
  }
  if (challenge.used_at) {
    throw new Error("Link challenge already used");
  }
  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    throw new Error("Link challenge expired");
  }

  if (!signedMessage.includes(nonce) || !signedMessage.includes(normalized)) {
    throw new Error("Signed message does not match challenge");
  }

  if (!verifyWalletSignature(signedMessage, signatureBase64, normalized)) {
    throw new Error("Invalid wallet signature");
  }

  const existingOwner = await pool.query<{ user_id: number }>(
    `SELECT user_id FROM user_wallets WHERE wallet_address = $1`,
    [normalized],
  );
  if (existingOwner.rows[0] && String(existingOwner.rows[0].user_id) !== userId) {
    throw new Error("Wallet is already linked to another account");
  }

  const hasPrimary = await pool.query<{ id: number }>(
    `SELECT id FROM user_wallets WHERE user_id = $1 AND is_primary = true LIMIT 1`,
    [userId],
  );
  const isPrimary = (hasPrimary.rowCount ?? 0) === 0;

  const linkResult = await pool.query<{ wallet_address: string; is_primary: boolean; linked_at: Date }>(
    `INSERT INTO user_wallets (user_id, wallet_address, is_primary)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, wallet_address) DO UPDATE SET user_id = EXCLUDED.user_id
     RETURNING wallet_address, is_primary, linked_at`,
    [userId, normalized, isPrimary],
  );

  await pool.query(`UPDATE wallet_link_challenges SET used_at = now() WHERE id = $1`, [
    challenge.id,
  ]);

  const row = linkResult.rows[0];
  return {
    address: row.wallet_address,
    isPrimary: row.is_primary,
    linkedAt: row.linked_at.toISOString(),
  };
}

export async function listLinkedWallets(userId: string): Promise<LinkedWallet[]> {
  const result = await getPool().query<{
    wallet_address: string;
    is_primary: boolean;
    linked_at: Date;
  }>(
    `SELECT wallet_address, is_primary, linked_at
     FROM user_wallets
     WHERE user_id = $1
     ORDER BY is_primary DESC, linked_at ASC`,
    [userId],
  );

  return result.rows.map((row) => ({
    address: row.wallet_address,
    isPrimary: row.is_primary,
    linkedAt: row.linked_at.toISOString(),
  }));
}

export async function unlinkWallet(userId: string, walletAddress: string): Promise<void> {
  let normalized: string;
  try {
    normalized = new PublicKey(walletAddress).toBase58();
  } catch {
    throw new Error("Invalid wallet address");
  }

  const pool = getPool();
  const result = await pool.query(
    `DELETE FROM user_wallets WHERE user_id = $1 AND wallet_address = $2 RETURNING is_primary`,
    [userId, normalized],
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error("Wallet not linked to your account");
  }

  const wasPrimary = result.rows[0]?.is_primary;
  if (wasPrimary) {
    await pool.query(`UPDATE user_wallets SET is_primary = false WHERE user_id = $1`, [userId]);
    await pool.query(
      `UPDATE user_wallets SET is_primary = true
       WHERE user_id = $1 AND wallet_address = (
         SELECT wallet_address FROM user_wallets WHERE user_id = $1 ORDER BY linked_at ASC LIMIT 1
       )`,
      [userId],
    );
  }
}

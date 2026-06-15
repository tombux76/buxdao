import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";
import { getPool } from "@/lib/db";
import { buildMerchAccessMessage } from "@/lib/merch/access-message";

export { buildMerchAccessMessage };

function verifyWalletSignature(
  message: string,
  signatureBase64: string,
  walletAddress: string,
): boolean {
  try {
    const pubkey = new PublicKey(walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signatureBase64, "base64");
    if (signatureBytes.length !== 64) return false;
    return nacl.sign.detached.verify(messageBytes, signatureBytes, pubkey.toBytes());
  } catch {
    return false;
  }
}

function parseMessageTimestamps(message: string): { issuedAtMs: number; expiresAtMs: number } | null {
  const issuedMatch = message.match(/^Issued: (\d+)$/m);
  const expiresMatch = message.match(/^Expires: (\d+)$/m);
  if (!issuedMatch || !expiresMatch) return null;
  const issuedAtMs = Number(issuedMatch[1]);
  const expiresAtMs = Number(expiresMatch[1]);
  if (!Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs)) return null;
  return { issuedAtMs, expiresAtMs };
}

async function walletLinkedToUser(userId: string, walletAddress: string): Promise<boolean> {
  let normalized: string;
  try {
    normalized = new PublicKey(walletAddress).toBase58();
  } catch {
    return false;
  }

  const result = await getPool().query<{ wallet_address: string }>(
    `SELECT wallet_address FROM user_wallets WHERE user_id = $1 AND wallet_address = $2 LIMIT 1`,
    [userId, normalized],
  );
  return result.rows.length > 0;
}

export type MerchWalletAuthInput = {
  walletAddress: string;
  message?: string;
  signature?: string;
  userId?: string | null;
};

export async function authorizeMerchWalletAccess(
  input: MerchWalletAuthInput,
): Promise<{ ok: true; walletAddress: string } | { ok: false; error: string }> {
  let normalized: string;
  try {
    normalized = new PublicKey(input.walletAddress.trim()).toBase58();
  } catch {
    return { ok: false, error: "Invalid wallet address" };
  }

  if (input.userId) {
    const linked = await walletLinkedToUser(input.userId, normalized);
    if (linked) {
      return { ok: true, walletAddress: normalized };
    }
  }

  const message = input.message?.trim();
  const signature = input.signature?.trim();
  if (!message || !signature) {
    return { ok: false, error: "Wallet signature required" };
  }

  if (!message.includes(normalized)) {
    return { ok: false, error: "Signed message does not match wallet" };
  }

  const times = parseMessageTimestamps(message);
  if (!times) {
    return { ok: false, error: "Invalid signed message format" };
  }

  const now = Date.now();
  if (now < times.issuedAtMs - 30_000 || now > times.expiresAtMs) {
    return { ok: false, error: "Signed message expired" };
  }

  if (!verifyWalletSignature(message, signature, normalized)) {
    return { ok: false, error: "Invalid wallet signature" };
  }

  return { ok: true, walletAddress: normalized };
}

/** Remove full Printful payload from status responses; keep summary fields only. */
export function sanitizeOrderRow(order: Record<string, unknown>) {
  const { printful_details: _omit, ...rest } = order;
  return rest;
}

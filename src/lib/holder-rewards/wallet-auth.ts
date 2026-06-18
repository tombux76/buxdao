import { getPool } from "@/lib/db";

export async function isWalletLinkedToUser(
  userId: string,
  walletAddress: string,
): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM user_wallets
       WHERE user_id = $1 AND wallet_address = $2
     ) AS exists`,
    [userId, walletAddress],
  );
  return rows[0]?.exists ?? false;
}

export async function listLinkedWalletAddresses(userId: string): Promise<string[]> {
  const pool = getPool();
  const { rows } = await pool.query<{ wallet_address: string }>(
    `SELECT wallet_address FROM user_wallets WHERE user_id = $1 ORDER BY is_primary DESC, linked_at ASC`,
    [userId],
  );
  return rows.map((r) => r.wallet_address);
}

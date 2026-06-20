import { getPool } from "@/lib/db";
import type { NftActivityEventType } from "@/lib/discord/nft-embed";

export async function markActivityProcessed(params: {
  signature: string;
  mint: string;
  eventType: NftActivityEventType;
}): Promise<boolean> {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `INSERT INTO nft_activity_processed (signature, mint, event_type)
     VALUES ($1, $2, $3)
     ON CONFLICT (signature, mint, event_type) DO NOTHING`,
    [params.signature, params.mint, params.eventType],
  );
  return (rowCount ?? 0) > 0;
}

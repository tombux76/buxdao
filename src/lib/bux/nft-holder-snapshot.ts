import { getPool } from "@/lib/db";

let tableReady: Promise<void> | null = null;

async function ensureSnapshotTable(): Promise<void> {
  if (tableReady) {
    return tableReady;
  }
  tableReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS nft_holder_snapshots (
        collection_id TEXT NOT NULL,
        wallet TEXT NOT NULL,
        nft_count INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection_id, wallet)
      )
    `);
  })().catch((error) => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

/**
 * Load last-good NFT owner counts. Never expires — when live DAS fails, a
 * stale snapshot is far better than collapsing the hub / leaderboard to 0.
 */
export async function loadNftHolderSnapshot(
  collectionId: string,
): Promise<Map<string, number> | null> {
  try {
    await ensureSnapshotTable();
    const pool = getPool();
    const { rows } = await pool.query<{
      wallet: string;
      nft_count: number;
      updated_at: Date;
    }>(
      `SELECT wallet, nft_count, updated_at
       FROM nft_holder_snapshots
       WHERE collection_id = $1`,
      [collectionId],
    );
    if (rows.length === 0) {
      return null;
    }
    const newest = rows.reduce(
      (max, row) => (row.updated_at > max ? row.updated_at : max),
      rows[0]!.updated_at,
    );
    const ageHours = Math.round(
      (Date.now() - new Date(newest).getTime()) / (60 * 60 * 1000),
    );
    if (ageHours > 24) {
      console.warn(
        `[nft-snapshot] ${collectionId} is ${ageHours}h old — using anyway until DAS recovers`,
      );
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.wallet, Number(row.nft_count));
    }
    return counts;
  } catch (error) {
    console.error("[nft-snapshot] load failed:", error);
    return null;
  }
}

export async function saveNftHolderSnapshot(
  collectionId: string,
  counts: Map<string, number>,
): Promise<void> {
  if (counts.size === 0) {
    return;
  }
  try {
    await ensureSnapshotTable();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM nft_holder_snapshots WHERE collection_id = $1`, [
        collectionId,
      ]);
      const wallets = [...counts.entries()];
      const chunkSize = 200;
      for (let i = 0; i < wallets.length; i += chunkSize) {
        const chunk = wallets.slice(i, i + chunkSize);
        const values: string[] = [];
        const params: unknown[] = [];
        for (const [wallet, nftCount] of chunk) {
          const offset = params.length;
          values.push(`($${offset + 1}, $${offset + 2}, $${offset + 3})`);
          params.push(collectionId, wallet, nftCount);
        }
        await client.query(
          `INSERT INTO nft_holder_snapshots (collection_id, wallet, nft_count)
           VALUES ${values.join(", ")}`,
          params,
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[nft-snapshot] save failed:", error);
  }
}

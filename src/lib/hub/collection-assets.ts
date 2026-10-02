import { getPool } from "@/lib/db";
import type { DasAsset } from "@/lib/discord/helius";

export type CachedCollectionAsset = {
  mint: string;
  collectionId: string;
  name: string;
  image: string | null;
  jsonUri: string | null;
};

let tableReady: Promise<void> | null = null;

async function ensureTable(): Promise<void> {
  if (tableReady) {
    return tableReady;
  }
  tableReady = (async () => {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS collection_assets (
        mint TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        name TEXT NOT NULL,
        image TEXT,
        json_uri TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS collection_assets_complete (
        collection_id TEXT PRIMARY KEY,
        completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  })().catch((error) => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

function directImage(asset: DasAsset): string | null {
  const content = asset.content;
  return (
    content?.links?.image?.trim() ||
    content?.files?.[0]?.cdn_uri?.trim() ||
    content?.files?.[0]?.uri?.trim() ||
    null
  );
}

/** Mint → name/image catalog. Static per mint, so the Hub can render without Helius DAS. */
export async function saveCollectionAssets(collectionId: string, assets: DasAsset[]): Promise<void> {
  await saveCatalogEntries(
    assets
      .filter((a) => a.id)
      .map((a) => ({
        mint: a.id!,
        collectionId,
        name: a.content?.metadata?.name?.trim() || "Unknown",
        image: directImage(a),
        jsonUri: a.content?.json_uri?.trim() || null,
      })),
  );
}

export async function saveCatalogEntries(rows: CachedCollectionAsset[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  try {
    await ensureTable();
    const pool = getPool();
    const chunkSize = 200;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const values: string[] = [];
      const params: unknown[] = [];
      for (const row of chunk) {
        const o = params.length;
        values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, now())`);
        params.push(row.mint, row.collectionId, row.name, row.image, row.jsonUri);
      }
      await pool.query(
        `INSERT INTO collection_assets (mint, collection_id, name, image, json_uri, updated_at)
         VALUES ${values.join(", ")}
         ON CONFLICT (mint) DO UPDATE SET
           collection_id = EXCLUDED.collection_id,
           name = EXCLUDED.name,
           image = COALESCE(EXCLUDED.image, collection_assets.image),
           json_uri = COALESCE(EXCLUDED.json_uri, collection_assets.json_uri),
           updated_at = now()`,
        params,
      );
    }
  } catch (error) {
    console.error("[collection-assets] save failed:", error);
  }
}

export async function loadCollectionAssetsByMints(
  mints: string[],
): Promise<Map<string, CachedCollectionAsset>> {
  const out = new Map<string, CachedCollectionAsset>();
  if (mints.length === 0) {
    return out;
  }
  await ensureTable();
  const { rows } = await getPool().query<{
    mint: string;
    collection_id: string;
    name: string;
    image: string | null;
    json_uri: string | null;
  }>(
    `SELECT mint, collection_id, name, image, json_uri
     FROM collection_assets
     WHERE mint = ANY($1::text[])`,
    [mints],
  );
  for (const row of rows) {
    out.set(row.mint, {
      mint: row.mint,
      collectionId: row.collection_id,
      name: row.name,
      image: row.image,
      jsonUri: row.json_uri,
    });
  }
  return out;
}

/** Call only after every page of a full getAssetsByGroup scan has been saved. */
export async function markCollectionAssetsComplete(collectionId: string): Promise<void> {
  try {
    await ensureTable();
    await getPool().query(
      `INSERT INTO collection_assets_complete (collection_id, completed_at)
       VALUES ($1, now())
       ON CONFLICT (collection_id) DO UPDATE SET completed_at = now()`,
      [collectionId],
    );
  } catch (error) {
    console.error("[collection-assets] mark complete failed:", error);
  }
}

/** Collections whose full catalog is cached — others still need a live DAS lookup. */
export async function loadCachedCollectionIds(): Promise<Set<string>> {
  try {
    await ensureTable();
    const { rows } = await getPool().query<{ collection_id: string }>(
      `SELECT collection_id FROM collection_assets_complete`,
    );
    return new Set(rows.map((r) => r.collection_id));
  } catch (error) {
    console.error("[collection-assets] load ids failed:", error);
    return new Set();
  }
}

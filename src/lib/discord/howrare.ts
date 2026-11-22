import { getPool } from "@/lib/db";

/** HowRare.is collection slug per BUXDAO collection id (`/rank`). */
export const HOWRARE_COLLECTION_SLUG: Record<string, string> = {
  "fcked-catz": "fckedcatz",
  "money-monsters": "moneymonsters",
  "money-monsters-3d": "moneymonsters3d",
};

export type HowRareNft = {
  mint: string;
  number: number;
  rank: number;
  link: string;
  rankAlgo: string;
  allRanks: Record<string, number>;
};

type HowRareOnlyRarityItem = {
  id: number | string;
  mint: string;
  link: string;
  rank: number;
  rank_algo?: string;
  all_ranks?: Record<string, number>;
};

type HowRareOnlyRarityResponse = {
  result?: {
    api_code?: number;
    data?: { items?: HowRareOnlyRarityItem[] };
  };
};

type RankCacheEntry = {
  expiresAt: number;
  byRank: Map<number, HowRareNft>;
  byMint: Map<string, HowRareNft>;
  byNumber: Map<number, HowRareNft>;
};

/** In-memory warm-instance cache (~15m). */
const MEMORY_TTL_MS = 15 * 60 * 1000;
/** Prefer a live HowRare refresh when Postgres rows are older than this. */
const DB_FRESH_MS = 24 * 60 * 60 * 1000;
/** HowRare only_rarity for fckedcatz is ~40s; leave headroom under Discord/Vercel limits. */
const HOWRARE_FETCH_TIMEOUT_MS = 50_000;

const rankCache = new Map<string, RankCacheEntry>();
let tableReady: Promise<void> | null = null;

export function collectionHasHowRareRanks(collectionId: string): boolean {
  return collectionId in HOWRARE_COLLECTION_SLUG;
}

async function ensureHowRareTable(): Promise<void> {
  if (tableReady) {
    return tableReady;
  }
  tableReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS howrare_rank_cache (
        collection_id TEXT NOT NULL,
        token_number INTEGER NOT NULL,
        mint TEXT NOT NULL,
        rank INTEGER NOT NULL,
        link TEXT NOT NULL DEFAULT '',
        rank_algo TEXT NOT NULL DEFAULT 'howrare.is',
        all_ranks JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (collection_id, token_number)
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS howrare_rank_cache_by_rank
        ON howrare_rank_cache (collection_id, rank)
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS howrare_rank_cache_by_mint
        ON howrare_rank_cache (collection_id, mint)
    `);
  })().catch((error) => {
    tableReady = null;
    throw error;
  });
  return tableReady;
}

function parseHowRareItem(item: HowRareOnlyRarityItem): HowRareNft | null {
  if (!item.mint || !Number.isFinite(item.rank)) {
    return null;
  }
  const number = Number.parseInt(String(item.id), 10);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return {
    mint: item.mint,
    number,
    rank: item.rank,
    link: item.link,
    rankAlgo: item.rank_algo ?? "howrare.is",
    allRanks: item.all_ranks ?? { "howrare.is": item.rank },
  };
}

function indexFromItems(
  items: HowRareNft[],
): Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber"> {
  const byRank = new Map<number, HowRareNft>();
  const byMint = new Map<string, HowRareNft>();
  const byNumber = new Map<number, HowRareNft>();
  for (const parsed of items) {
    if (!byRank.has(parsed.rank)) {
      byRank.set(parsed.rank, parsed);
    }
    byMint.set(parsed.mint, parsed);
    if (!byNumber.has(parsed.number)) {
      byNumber.set(parsed.number, parsed);
    }
  }
  return { byRank, byMint, byNumber };
}

function rowToNft(row: {
  mint: string;
  token_number: number;
  rank: number;
  link: string;
  rank_algo: string;
  all_ranks: Record<string, number> | string;
}): HowRareNft {
  const allRanks =
    typeof row.all_ranks === "string"
      ? (JSON.parse(row.all_ranks) as Record<string, number>)
      : row.all_ranks;
  return {
    mint: row.mint,
    number: Number(row.token_number),
    rank: Number(row.rank),
    link: row.link ?? "",
    rankAlgo: row.rank_algo || "howrare.is",
    allRanks: allRanks ?? { "howrare.is": Number(row.rank) },
  };
}

async function loadIndexFromDb(
  collectionId: string,
): Promise<{ index: Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber">; updatedAt: number } | null> {
  try {
    await ensureHowRareTable();
    const pool = getPool();
    const { rows } = await pool.query<{
      mint: string;
      token_number: number;
      rank: number;
      link: string;
      rank_algo: string;
      all_ranks: Record<string, number>;
      updated_at: Date;
    }>(
      `SELECT mint, token_number, rank, link, rank_algo, all_ranks, updated_at
       FROM howrare_rank_cache
       WHERE collection_id = $1`,
      [collectionId],
    );
    if (rows.length === 0) {
      return null;
    }
    const items = rows.map(rowToNft);
    const newest = rows.reduce(
      (max, row) => (row.updated_at > max ? row.updated_at : max),
      rows[0]!.updated_at,
    );
    return { index: indexFromItems(items), updatedAt: new Date(newest).getTime() };
  } catch (error) {
    console.error(`[howrare] DB load failed for ${collectionId}:`, error);
    return null;
  }
}

async function saveIndexToDb(collectionId: string, items: HowRareNft[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  try {
    await ensureHowRareTable();
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM howrare_rank_cache WHERE collection_id = $1`, [
        collectionId,
      ]);
      const chunkSize = 200;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        const values: string[] = [];
        const params: unknown[] = [];
        for (const item of chunk) {
          const offset = params.length;
          values.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`,
          );
          params.push(
            collectionId,
            item.number,
            item.mint,
            item.rank,
            item.link,
            item.rankAlgo,
            JSON.stringify(item.allRanks),
          );
        }
        await client.query(
          `INSERT INTO howrare_rank_cache
             (collection_id, token_number, mint, rank, link, rank_algo, all_ranks)
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
    console.error(`[howrare] DB save failed for ${collectionId}:`, error);
  }
}

async function fetchHowRareItems(collectionId: string): Promise<HowRareNft[]> {
  const slug = HOWRARE_COLLECTION_SLUG[collectionId];
  if (!slug) {
    return [];
  }

  const response = await fetch(
    `https://api.howrare.is/v0.1/collections/${slug}/only_rarity`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "BUXDAO/2.0 (discord-rarity; +https://www.buxdao.com)",
      },
      signal: AbortSignal.timeout(HOWRARE_FETCH_TIMEOUT_MS),
      next: { revalidate: 3600 },
    },
  );
  if (!response.ok) {
    throw new Error(`HowRare.is request failed (${response.status})`);
  }

  const payload = (await response.json()) as HowRareOnlyRarityResponse;
  if (payload.result?.api_code !== 200) {
    throw new Error("HowRare.is returned an unexpected response");
  }

  const items: HowRareNft[] = [];
  for (const item of payload.result?.data?.items ?? []) {
    const parsed = parseHowRareItem(item);
    if (parsed) {
      items.push(parsed);
    }
  }
  return items;
}

async function buildRankIndex(
  collectionId: string,
): Promise<Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber">> {
  const items = await fetchHowRareItems(collectionId);
  await saveIndexToDb(collectionId, items);
  return indexFromItems(items);
}

function remember(
  collectionId: string,
  index: Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber">,
): Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber"> {
  rankCache.set(collectionId, { expiresAt: Date.now() + MEMORY_TTL_MS, ...index });
  return index;
}

/**
 * Memory → fresh Postgres → live HowRare (then persist) → stale Postgres.
 * Live HowRare for fckedcatz is ~40s; Discord must not depend on that every cold start.
 */
async function getRankCacheEntry(
  collectionId: string,
): Promise<Pick<RankCacheEntry, "byRank" | "byMint" | "byNumber">> {
  const cached = rankCache.get(collectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return { byRank: cached.byRank, byMint: cached.byMint, byNumber: cached.byNumber };
  }

  const fromDb = await loadIndexFromDb(collectionId);
  const dbFresh = fromDb != null && Date.now() - fromDb.updatedAt < DB_FRESH_MS;
  if (dbFresh && fromDb) {
    return remember(collectionId, fromDb.index);
  }

  try {
    const index = await buildRankIndex(collectionId);
    return remember(collectionId, index);
  } catch (error) {
    if (fromDb) {
      console.warn(
        `[howrare] live fetch failed for ${collectionId}; using stale DB cache`,
        error,
      );
      return remember(collectionId, fromDb.index);
    }
    throw error;
  }
}

/** Refresh one or all HowRare collections into Postgres (cron / manual). */
export async function refreshHowRareCache(
  collectionId?: string,
): Promise<{ collectionId: string; count: number }[]> {
  const ids = collectionId
    ? [collectionId]
    : Object.keys(HOWRARE_COLLECTION_SLUG);
  const results: { collectionId: string; count: number }[] = [];
  for (const id of ids) {
    if (!HOWRARE_COLLECTION_SLUG[id]) {
      continue;
    }
    const items = await fetchHowRareItems(id);
    await saveIndexToDb(id, items);
    remember(id, indexFromItems(items));
    results.push({ collectionId: id, count: items.length });
  }
  return results;
}

export async function lookupNftByRankFromHowRare(
  collectionId: string,
  rank: number,
): Promise<HowRareNft | null> {
  if (!HOWRARE_COLLECTION_SLUG[collectionId]) {
    return null;
  }
  const { byRank } = await getRankCacheEntry(collectionId);
  return byRank.get(rank) ?? null;
}

export async function lookupRankByMintFromHowRare(
  collectionId: string,
  mint: string,
): Promise<number | null> {
  const entry = await lookupHowRareNftByMint(collectionId, mint);
  return entry?.rank ?? null;
}

export async function lookupHowRareNftByMint(
  collectionId: string,
  mint: string,
): Promise<HowRareNft | null> {
  if (!HOWRARE_COLLECTION_SLUG[collectionId]) {
    return null;
  }
  const { byMint } = await getRankCacheEntry(collectionId);
  return byMint.get(mint) ?? null;
}

/** Token id / name number → HowRare row (DAS-independent fallback for `/nft`). */
export async function lookupHowRareNftByNumber(
  collectionId: string,
  tokenNumber: number,
): Promise<HowRareNft | null> {
  if (!HOWRARE_COLLECTION_SLUG[collectionId]) {
    return null;
  }
  const { byNumber } = await getRankCacheEntry(collectionId);
  return byNumber.get(tokenNumber) ?? null;
}

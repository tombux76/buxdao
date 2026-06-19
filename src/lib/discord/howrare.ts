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

const CACHE_TTL_MS = 60 * 60 * 1000;
type RankCacheEntry = {
  expiresAt: number;
  byRank: Map<number, HowRareNft>;
  byMint: Map<string, HowRareNft>;
};
const rankCache = new Map<string, RankCacheEntry>();

export function collectionHasHowRareRanks(collectionId: string): boolean {
  return collectionId in HOWRARE_COLLECTION_SLUG;
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

async function buildRankIndex(collectionId: string): Promise<Pick<RankCacheEntry, "byRank" | "byMint">> {
  const slug = HOWRARE_COLLECTION_SLUG[collectionId];
  if (!slug) {
    return { byRank: new Map(), byMint: new Map() };
  }

  const response = await fetch(`https://api.howrare.is/v0.1/collections/${slug}/only_rarity`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`HowRare.is request failed (${response.status})`);
  }

  const payload = (await response.json()) as HowRareOnlyRarityResponse;
  if (payload.result?.api_code !== 200) {
    throw new Error("HowRare.is returned an unexpected response");
  }

  const byRank = new Map<number, HowRareNft>();
  const byMint = new Map<string, HowRareNft>();
  for (const item of payload.result?.data?.items ?? []) {
    const parsed = parseHowRareItem(item);
    if (!parsed) {
      continue;
    }
    if (!byRank.has(parsed.rank)) {
      byRank.set(parsed.rank, parsed);
    }
    byMint.set(parsed.mint, parsed);
  }
  return { byRank, byMint };
}

/** In-memory cache per warm instance (~1h). Used by `/rank` and `/nft` rarity. */
async function getRankCacheEntry(collectionId: string): Promise<Pick<RankCacheEntry, "byRank" | "byMint">> {
  const cached = rankCache.get(collectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return { byRank: cached.byRank, byMint: cached.byMint };
  }

  const index = await buildRankIndex(collectionId);
  rankCache.set(collectionId, { expiresAt: Date.now() + CACHE_TTL_MS, ...index });
  return index;
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

import { getCollectionConfig } from "@/lib/discord/config";
import { type DasAsset, fetchAssetsByGroup } from "@/lib/discord/helius";

export type IndexedNft = {
  mint: string;
  name: string;
  number: number | null;
  rank: number | null;
  image: string | null;
  owner: string | null;
};

export type CollectionIndex = {
  byNumber: Map<number, IndexedNft>;
  byRank: Map<number, IndexedNft>;
};

const CACHE_TTL_MS = 60 * 60 * 1000;
const indexCache = new Map<string, { expiresAt: number; index: CollectionIndex }>();

function parseNftNumber(name: string): number | null {
  const match = name.match(/#\s*(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function parseRankFromAttributes(
  attributes: { trait_type?: string; value?: string | number }[] | undefined,
): number | null {
  if (!attributes?.length) {
    return null;
  }
  for (const attr of attributes) {
    const type = (attr.trait_type ?? "").toLowerCase();
    if (!type.includes("rank")) {
      continue;
    }
    const n = Number.parseInt(String(attr.value).replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  }
  return null;
}

function assetToIndexed(asset: DasAsset): IndexedNft | null {
  const mint = asset.id;
  if (!mint) {
    return null;
  }
  const name = asset.content?.metadata?.name?.trim() || "Unknown";
  return {
    mint,
    name,
    number: parseNftNumber(name),
    rank: parseRankFromAttributes(asset.content?.metadata?.attributes),
    image: asset.content?.links?.image ?? null,
    owner: asset.ownership?.owner ?? null,
  };
}

async function buildCollectionIndex(collectionId: string): Promise<CollectionIndex> {
  const config = getCollectionConfig(collectionId);
  if (!config) {
    return { byNumber: new Map(), byRank: new Map() };
  }

  const assets = await fetchAssetsByGroup(config.collectionMint);
  const byNumber = new Map<number, IndexedNft>();
  const byRank = new Map<number, IndexedNft>();

  for (const asset of assets) {
    const indexed = assetToIndexed(asset);
    if (!indexed) {
      continue;
    }
    if (indexed.number != null && !byNumber.has(indexed.number)) {
      byNumber.set(indexed.number, indexed);
    }
    if (indexed.rank != null && !byRank.has(indexed.rank)) {
      byRank.set(indexed.rank, indexed);
    }
  }

  return { byNumber, byRank };
}

/** In-memory cache per warm instance (~1h). Used by `/nft` and `/rank`. */
export async function getCollectionIndex(collectionId: string): Promise<CollectionIndex> {
  const cached = indexCache.get(collectionId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.index;
  }

  const index = await buildCollectionIndex(collectionId);
  indexCache.set(collectionId, { expiresAt: Date.now() + CACHE_TTL_MS, index });
  return index;
}

export async function lookupNftByNumber(
  collectionId: string,
  tokenNumber: number,
): Promise<IndexedNft | null> {
  const index = await getCollectionIndex(collectionId);
  return index.byNumber.get(tokenNumber) ?? null;
}

export async function lookupNftByRank(
  collectionId: string,
  rank: number,
): Promise<IndexedNft | null> {
  const index = await getCollectionIndex(collectionId);
  return index.byRank.get(rank) ?? null;
}

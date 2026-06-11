import { cache } from "react";
import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { fetchCollectionSupply } from "@/lib/helius";
import {
  fetchMagicEdenCollection,
  fetchMagicEdenStats,
  formatCount,
  formatPercentListed,
  formatSol,
} from "@/lib/magic-eden";

type CollectionStatsFields = {
  floor: string;
  volume24h: string;
  totalVolume: string;
  supply: string;
  listed: string;
  percentListed: string;
};

export type CollectionWithStats = CollectionConfig & CollectionStatsFields;

const EMPTY_STATS: CollectionStatsFields = {
  floor: "— SOL",
  volume24h: "— SOL",
  totalVolume: "— SOL",
  supply: "—",
  listed: "—",
  percentListed: "—%",
};

function withStats(
  config: CollectionConfig,
  stats: Partial<CollectionStatsFields>,
): CollectionWithStats {
  return { ...config, ...EMPTY_STATS, ...stats };
}

async function resolveSupply(
  config: CollectionConfig,
  meSupply?: number,
): Promise<number | null> {
  const heliusSupply = await fetchCollectionSupply(config.collectionMint);
  if (heliusSupply != null) {
    return heliusSupply;
  }

  if (meSupply != null && meSupply > 0) {
    return meSupply;
  }

  return null;
}

async function enrichCollection(config: CollectionConfig): Promise<CollectionWithStats> {
  const [stats, metadata] = await Promise.all([
    fetchMagicEdenStats(config.magicEdenSymbol),
    fetchMagicEdenCollection(config.magicEdenSymbol),
  ]);

  const supply = await resolveSupply(config, metadata?.totalSupply);
  const listed = stats?.listedCount;

  if (!stats) {
    return withStats(config, {
      supply: formatCount(supply),
      listed: formatCount(listed),
      percentListed: formatPercentListed(listed, supply),
    });
  }

  return withStats(config, {
    floor: formatSol(stats.floorPrice),
    volume24h: "— SOL",
    totalVolume: formatSol(stats.volumeAll),
    supply: formatCount(supply),
    listed: formatCount(listed),
    percentListed: formatPercentListed(listed, supply),
  });
}

export const getCollectionsWithStats = cache(async (): Promise<CollectionWithStats[]> => {
  return Promise.all(collectionConfigs.map(enrichCollection));
});

export type TickerItem = {
  label: string;
  value: string;
  change: string;
};

export async function getTickerItems(): Promise<TickerItem[]> {
  const collections = await getCollectionsWithStats();

  return collections.map((collection) => ({
    label: collection.name,
    value: collection.floor,
    change: "floor",
  }));
}

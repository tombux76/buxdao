import { cache } from "react";
import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { fetchGraveMarketCollectionStats } from "@/lib/gravemarket";
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

async function enrichFromMagicEdenAndHelius(
  config: CollectionConfig,
): Promise<CollectionWithStats> {
  const [stats, metadata] = await Promise.all([
    fetchMagicEdenStats(config.magicEdenSymbol),
    fetchMagicEdenCollection(config.magicEdenSymbol),
  ]);

  const heliusSupply = await fetchCollectionSupply(config.collectionMint);
  const supply = heliusSupply ?? metadata?.totalSupply ?? null;
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

async function enrichCollection(config: CollectionConfig): Promise<CollectionWithStats> {
  const graveMarketStats = await fetchGraveMarketCollectionStats(config.id);

  if (graveMarketStats) {
    return withStats(config, graveMarketStats);
  }

  return enrichFromMagicEdenAndHelius(config);
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

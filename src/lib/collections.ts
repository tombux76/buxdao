import { cache } from "react";
import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { fetchGraveMarketCollectionStats } from "@/lib/gravemarket";
import { fetchCollectionSupply } from "@/lib/helius";
import { fetchMagicEdenStats, formatSol } from "@/lib/magic-eden";
function formatCount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString();
}

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

async function enrichCollection(config: CollectionConfig): Promise<CollectionWithStats> {
  const [graveMarketStats, heliusSupply, magicEdenStats] = await Promise.all([
    fetchGraveMarketCollectionStats(config.id),
    fetchCollectionSupply(config.collectionMint),
    fetchMagicEdenStats(config.magicEdenSymbol),
  ]);

  const magicEdenFloor = formatSol(magicEdenStats?.floorPrice);

  if (graveMarketStats) {
    return withStats(config, {
      ...graveMarketStats,
      floor: graveMarketStats.floor === "— SOL" ? magicEdenFloor : graveMarketStats.floor,
      supply:
        graveMarketStats.supply === "—"
          ? formatCount(heliusSupply)
          : graveMarketStats.supply,
    });
  }

  return withStats(config, {
    floor: magicEdenFloor,
    supply: formatCount(heliusSupply),
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

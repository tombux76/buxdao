import { cache } from "react";
import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { fetchGraveMarketCollectionStats } from "@/lib/gravemarket";
import { fetchCollectionSupply } from "@/lib/helius";
import {
  fetchMagicEdenCollection,
  fetchMagicEdenStats,
  formatCount as formatMeCount,
  formatPercentListed as formatMePercentListed,
  formatSol,
} from "@/lib/magic-eden";
import { fetchOrbisCollectionStats } from "@/lib/orbis";

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

export type CollectionWithStats = CollectionConfig &
  CollectionStatsFields & {
    /** Where floor / volume primarily came from after fallbacks. */
    marketSource: "orbis" | "gravemarket" | "magic-eden";
  };

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
  stats: Partial<CollectionStatsFields> & Pick<CollectionWithStats, "marketSource">,
): CollectionWithStats {
  return { ...config, ...EMPTY_STATS, ...stats };
}

function isBlankSol(value: string | undefined): boolean {
  return !value || value === "— SOL";
}

function isBlankCount(value: string | undefined): boolean {
  return !value || value === "—";
}

async function enrichCollection(config: CollectionConfig): Promise<CollectionWithStats> {
  const [orbisStats, graveMarketStats, heliusSupply, magicEdenStats, magicEdenCollection] =
    await Promise.all([
      fetchOrbisCollectionStats({
        collectionMint: config.collectionMint,
        pathname: config.id,
      }),
      fetchGraveMarketCollectionStats(config.id),
      fetchCollectionSupply(config.collectionMint),
      fetchMagicEdenStats(config.magicEdenSymbol),
      fetchMagicEdenCollection(config.magicEdenSymbol),
    ]);

  const supplyRaw = heliusSupply ?? magicEdenCollection?.totalSupply ?? null;
  const magicEdenFloor = formatSol(magicEdenStats?.floorPrice);
  const magicEdenListed = formatMeCount(magicEdenStats?.listedCount);
  const magicEdenTotalVolume = formatSol(magicEdenStats?.volumeAll);
  const magicEdenSupply = formatCount(supplyRaw);
  const magicEdenPercentListed = formatMePercentListed(
    magicEdenStats?.listedCount,
    supplyRaw,
  );

  // Prefer Orbis (aggregated floor + Tensor/ME/Orbis all-time volume) — no API key.
  if (orbisStats && !isBlankSol(orbisStats.floor)) {
    return withStats(config, {
      floor: orbisStats.floor,
      volume24h: !isBlankSol(orbisStats.volume24h)
        ? orbisStats.volume24h
        : (graveMarketStats?.volume24h ?? "— SOL"),
      totalVolume: !isBlankSol(orbisStats.totalVolume)
        ? orbisStats.totalVolume
        : !isBlankSol(magicEdenTotalVolume)
          ? magicEdenTotalVolume
          : (graveMarketStats?.totalVolume ?? "— SOL"),
      supply: !isBlankCount(orbisStats.supply)
        ? orbisStats.supply
        : formatCount(supplyRaw),
      listed: !isBlankCount(orbisStats.listed)
        ? orbisStats.listed
        : !isBlankCount(magicEdenListed)
          ? magicEdenListed
          : (graveMarketStats?.listed ?? "—"),
      percentListed:
        orbisStats.percentListed !== "—%"
          ? orbisStats.percentListed
          : magicEdenPercentListed,
      marketSource: "orbis",
    });
  }

  const graveFloorMissing = !graveMarketStats || isBlankSol(graveMarketStats.floor);

  // GraveMarket present but incomplete volume — still prefer ME for floor + all-time volume.
  if (!graveFloorMissing && graveMarketStats) {
    return withStats(config, {
      floor: !isBlankSol(magicEdenFloor) ? magicEdenFloor : graveMarketStats.floor,
      volume24h: graveMarketStats.volume24h,
      totalVolume: !isBlankSol(magicEdenTotalVolume)
        ? magicEdenTotalVolume
        : graveMarketStats.totalVolume,
      supply: isBlankCount(graveMarketStats.supply)
        ? formatCount(heliusSupply)
        : graveMarketStats.supply,
      listed: !isBlankCount(magicEdenListed) ? magicEdenListed : graveMarketStats.listed,
      percentListed:
        magicEdenPercentListed !== "—%"
          ? magicEdenPercentListed
          : graveMarketStats.percentListed,
      marketSource: !isBlankSol(magicEdenFloor) || !isBlankSol(magicEdenTotalVolume)
        ? "magic-eden"
        : "gravemarket",
    });
  }

  return withStats(config, {
    floor: magicEdenFloor,
    volume24h: graveMarketStats && !isBlankSol(graveMarketStats.volume24h)
      ? graveMarketStats.volume24h
      : "— SOL",
    totalVolume: !isBlankSol(magicEdenTotalVolume)
      ? magicEdenTotalVolume
      : (graveMarketStats?.totalVolume ?? "— SOL"),
    supply: !isBlankCount(magicEdenSupply)
      ? magicEdenSupply
      : (graveMarketStats?.supply ?? "—"),
    listed: !isBlankCount(magicEdenListed)
      ? magicEdenListed
      : (graveMarketStats?.listed ?? "—"),
    percentListed:
      magicEdenPercentListed !== "—%"
        ? magicEdenPercentListed
        : (graveMarketStats?.percentListed ?? "—%"),
    marketSource: "magic-eden",
  });
}

export const getCollectionsWithStats = cache(async (): Promise<CollectionWithStats[]> => {
  return Promise.all(collectionConfigs.map(enrichCollection));
});

/** Single-collection stats (Discord `/collections`) — same Orbis → GM/ME path as the ticker. */
export async function getCollectionWithStats(
  collectionId: string,
): Promise<CollectionWithStats | null> {
  const config = collectionConfigs.find((entry) => entry.id === collectionId);
  if (!config) {
    return null;
  }
  return enrichCollection(config);
}

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

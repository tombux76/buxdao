import { GravemarketClient } from "@solanadeads/gravemarket";

export type GraveMarketCollectionStats = {
  floor: string;
  volume24h: string;
  totalVolume: string;
  supply: string;
  listed: string;
  percentListed: string;
};

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  return null;
}

function formatSolAmount(sol?: number | null): string {
  if (sol == null || Number.isNaN(sol) || sol <= 0) {
    return "— SOL";
  }

  if (sol < 0.01) {
    return `${sol.toFixed(4)} SOL`;
  }

  return `${sol.toFixed(2)} SOL`;
}

function formatCount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return value.toLocaleString();
}

function formatPercentListed(listed?: number | null, supply?: number | null): string {
  if (
    listed == null ||
    supply == null ||
    supply <= 0 ||
    Number.isNaN(listed) ||
    Number.isNaN(supply)
  ) {
    return "—%";
  }

  return `${((listed / supply) * 100).toFixed(1)}%`;
}

function getClient(): GravemarketClient | null {
  const apiKey = process.env.GRAVEMARKET_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new GravemarketClient({ apiKey });
}

/** Raw floor price in SOL for holder value calculations. */
export async function fetchGraveMarketFloorSol(slug: string): Promise<number | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    const statsResponse = await client.collections.stats(slug);
    const stats = statsResponse.stats;
    const floor = toOptionalNumber(stats?.floor_price);
    return floor != null && floor > 0 ? floor : null;
  } catch {
    return null;
  }
}

/** Fetch collection stats from GraveMarket by slug (matches gravemarket.io/collection/{slug}). */
export async function fetchGraveMarketCollectionStats(
  slug: string,
): Promise<GraveMarketCollectionStats | null> {
  const client = getClient();
  if (!client) {
    return null;
  }

  try {
    const [detail, statsResponse] = await Promise.all([
      client.collections.get(slug),
      client.collections.stats(slug),
    ]);

    const stats = statsResponse.stats ?? detail.market_collection_stats;
    if (!stats) {
      return null;
    }

    const supply = toOptionalNumber(detail.total_supply ?? stats.total_items);
    const listed = toOptionalNumber(stats.listed_count ?? detail.total_listed);
    const totalVolume = toOptionalNumber(
      stats.total_volume_all_time ?? stats.total_volume ?? detail.total_volume,
    );

    return {
      floor: formatSolAmount(toOptionalNumber(stats.floor_price ?? detail.floor_price)),
      volume24h: formatSolAmount(toOptionalNumber(stats.volume_24h)),
      totalVolume: formatSolAmount(totalVolume),
      supply: formatCount(supply),
      listed: formatCount(listed),
      percentListed: formatPercentListed(listed, supply),
    };
  } catch {
    return null;
  }
}

/**
 * Orbis marketplace stats via the public marketplace endpoint
 * (no API key — same payload the Orbis site uses).
 * Documented `/api/mp-public` requires X-API-Key; we intentionally avoid it.
 */

const ORBIS_MARKETPLACE_API = "https://www.orbisonsol.io/api/marketplace";
const CACHE_TTL_MS = 60_000;

export type OrbisCollectionStats = {
  floor: string;
  volume24h: string;
  totalVolume: string;
  supply: string;
  listed: string;
  percentListed: string;
  pathname: string;
  floorSol: number | null;
  totalVolumeSol: number | null;
};

type OrbisRawStats = {
  floorPrice?: number;
  volume24h?: number;
  volumeAll?: number;
  meReportedVolume?: number;
  tensorReportedVolume?: number;
  listed?: number;
  supply?: number;
  owners?: number;
};

type OrbisCollectionRow = {
  id?: string;
  name?: string;
  pathname?: string;
  collectionAddress?: string;
  stats?: OrbisRawStats;
};

type CacheEntry = {
  at: number;
  byMint: Map<string, OrbisCollectionRow>;
  byPath: Map<string, OrbisCollectionRow>;
};

let collectionsCache: CacheEntry | null = null;

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

/**
 * All-time volume across venues Orbis tracks.
 * `volumeAll` is Orbis-native only; ME/Tensor reported volumes fill the gap.
 */
function allTimeVolumeSol(stats: OrbisRawStats | undefined): number | null {
  if (!stats) {
    return null;
  }
  const parts = [stats.volumeAll, stats.meReportedVolume, stats.tensorReportedVolume]
    .map((v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0));
  const sum = parts.reduce((a, b) => a + b, 0);
  return sum > 0 ? sum : null;
}

function rowToStats(row: OrbisCollectionRow): OrbisCollectionStats {
  const stats = row.stats ?? {};
  const floorSol =
    typeof stats.floorPrice === "number" && stats.floorPrice > 0 ? stats.floorPrice : null;
  const totalVolumeSol = allTimeVolumeSol(stats);
  const volume24 =
    typeof stats.volume24h === "number" && stats.volume24h > 0 ? stats.volume24h : null;
  const listed = typeof stats.listed === "number" ? stats.listed : null;
  const supply = typeof stats.supply === "number" ? stats.supply : null;

  return {
    floor: formatSolAmount(floorSol),
    volume24h: formatSolAmount(volume24),
    totalVolume: formatSolAmount(totalVolumeSol),
    supply: formatCount(supply),
    listed: formatCount(listed),
    percentListed: formatPercentListed(listed, supply),
    pathname: row.pathname ?? "",
    floorSol,
    totalVolumeSol,
  };
}

async function loadOrbisCollections(): Promise<CacheEntry> {
  if (collectionsCache && Date.now() - collectionsCache.at < CACHE_TTL_MS) {
    return collectionsCache;
  }

  const response = await fetch(`${ORBIS_MARKETPLACE_API}?action=getCollections`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BUXDAO/2.0 (+https://www.buxdao.com)",
    },
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`Orbis getCollections failed (${response.status})`);
  }

  const payload = (await response.json()) as {
    success?: boolean;
    collections?: OrbisCollectionRow[];
  };
  const rows = payload.collections ?? [];
  const byMint = new Map<string, OrbisCollectionRow>();
  const byPath = new Map<string, OrbisCollectionRow>();
  for (const row of rows) {
    if (row.collectionAddress) {
      byMint.set(row.collectionAddress, row);
    }
    if (row.pathname) {
      byPath.set(row.pathname, row);
    }
  }

  collectionsCache = { at: Date.now(), byMint, byPath };
  return collectionsCache;
}

/** Stats for one BUXDAO collection (by on-chain collection mint and/or Orbis pathname). */
export async function fetchOrbisCollectionStats(params: {
  collectionMint: string;
  pathname?: string;
}): Promise<OrbisCollectionStats | null> {
  try {
    const cache = await loadOrbisCollections();
    const row =
      cache.byMint.get(params.collectionMint) ??
      (params.pathname ? cache.byPath.get(params.pathname) : undefined);
    if (!row) {
      return null;
    }
    return rowToStats(row);
  } catch (error) {
    console.error("[orbis] collection stats failed:", error);
    return null;
  }
}

/** Raw floor in SOL for holder-value calculations. */
export async function fetchOrbisFloorSol(collectionMint: string): Promise<number | null> {
  const stats = await fetchOrbisCollectionStats({ collectionMint });
  return stats?.floorSol ?? null;
}

import { cache } from "react";
import { collectionConfigs, type CollectionConfig } from "@/content/site";

const GRAVESTAKE_API = "https://api.solanadeads.com";

type GravestakePoolApiRow = {
  pool_pubkey: string;
  slug?: string;
  collection_size?: number | null;
  positions_open?: number;
  pct_staked_bps?: number;
  total_stakers?: number;
  total_staked_weight?: string | number;
  display_name?: string;
  paused?: boolean;
};

type GravestakePoolsResponse = {
  pools?: GravestakePoolApiRow[];
};

export type GravestakePoolStats = {
  supply: string;
  staked: string;
  percentStaked: string;
  totalStakers: string;
  /** Raw values when available (for Discord slash commands, etc.) */
  supplyRaw: number | null;
  stakedRaw: number | null;
  percentStakedRaw: number | null;
};

export type StakingPoolWithStats = CollectionConfig & GravestakePoolStats;

const EMPTY_STATS: GravestakePoolStats = {
  supply: "—",
  staked: "—",
  percentStaked: "—%",
  totalStakers: "—",
  supplyRaw: null,
  stakedRaw: null,
  percentStakedRaw: null,
};

function formatCount(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}

function formatPercentFromBps(bps?: number | null): string {
  if (bps == null || Number.isNaN(bps)) return "—%";
  return `${(bps / 100).toFixed(1)}%`;
}

function mapPoolStats(pool: GravestakePoolApiRow): GravestakePoolStats {
  const supplyRaw =
    pool.collection_size != null && !Number.isNaN(pool.collection_size)
      ? pool.collection_size
      : null;
  const stakedRaw =
    pool.positions_open != null && !Number.isNaN(pool.positions_open)
      ? pool.positions_open
      : null;
  const percentStakedRaw =
    pool.pct_staked_bps != null && !Number.isNaN(pool.pct_staked_bps)
      ? pool.pct_staked_bps / 100
      : null;

  return {
    supply: formatCount(supplyRaw),
    staked: formatCount(stakedRaw),
    percentStaked: formatPercentFromBps(pool.pct_staked_bps),
    totalStakers: formatCount(pool.total_stakers),
    supplyRaw,
    stakedRaw,
    percentStakedRaw,
  };
}

/** All GraveStake pools indexed by pool wallet (`pool_pubkey`). */
export const fetchGravestakePoolsByPubkey = cache(async (): Promise<Map<string, GravestakePoolApiRow>> => {
  try {
    const res = await fetch(`${GRAVESTAKE_API}/gravestake/pools`, {
      next: { revalidate: 120 },
    });
    if (!res.ok) return new Map();

    const data = (await res.json()) as GravestakePoolsResponse;
    const map = new Map<string, GravestakePoolApiRow>();
    for (const pool of data.pools ?? []) {
      if (pool.pool_pubkey) {
        map.set(pool.pool_pubkey, pool);
      }
    }
    return map;
  } catch {
    return new Map();
  }
});

/** Per-pool detail (reward slots, APY, etc.) — use when the list endpoint is not enough. */
export async function fetchGravestakePoolDetail(poolPubkey: string) {
  try {
    const res = await fetch(
      `${GRAVESTAKE_API}/gravestake/pools/${encodeURIComponent(poolPubkey)}`,
      { next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as {
      pool?: GravestakePoolApiRow;
      reward_slots?: {
        rate?: number;
        token_symbol?: string;
        token_name?: string;
        lifetime_paid_out?: number;
      }[];
    };
  } catch {
    return null;
  }
}

export const getStakingPoolsWithStats = cache(async (): Promise<StakingPoolWithStats[]> => {
  const poolsByPubkey = await fetchGravestakePoolsByPubkey();

  return collectionConfigs.map((config) => {
    const pool = config.stakingWallet ? poolsByPubkey.get(config.stakingWallet) : undefined;
    if (!pool) {
      return { ...config, ...EMPTY_STATS };
    }
    return { ...config, ...mapPoolStats(pool) };
  });
});

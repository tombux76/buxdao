import { collectionConfigs } from "@/content/site";
import { fetchGraveMarketFloorSol } from "@/lib/gravemarket";
import { getWalletDiscordMap } from "@/lib/bux/discord";
import { buildRawHolders } from "@/lib/bux/helius-holders";
import { fetchTokenMetrics } from "@/lib/bux/metrics";

export type HolderRow = {
  discord_id: string;
  discord_username: string;
  nfts: string;
  bux: string;
  value: string;
  sortValue: number;
  buxBalance: number;
  nftCount: number;
};

export type TopHoldersResult = {
  holders: HolderRow[];
  availableCollections: { value: string; label: string }[];
};

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 4)}…${wallet.slice(-4)}`;
}

function formatValue(sol: number, usd: number): string {
  const solStr = sol < 0.01 ? sol.toFixed(6) : sol.toFixed(2);
  const usdStr = usd > 0 ? usd.toFixed(2) : "0.00";
  return `${solStr} SOL ($${usdStr})`;
}

async function getFloorPrices(): Promise<Record<string, number>> {
  const entries = await Promise.all(
    collectionConfigs.map(async (config) => {
      const floor = await fetchGraveMarketFloorSol(config.id);
      return [config.id, floor ?? 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

type AggregatedHolder = {
  key: string;
  discordId: string | null;
  displayName: string;
  buxBalance: number;
  nftCounts: Record<string, number>;
  totalNfts: number;
};

function nftSolValue(h: AggregatedHolder, floors: Record<string, number>, collectionId: string): number {
  if (collectionId === "all") {
    return collectionConfigs.reduce(
      (sum, config) => sum + (h.nftCounts[config.id] ?? 0) * (floors[config.id] ?? 0),
      0,
    );
  }
  return (h.nftCounts[collectionId] ?? 0) * (floors[collectionId] ?? 0);
}

export async function fetchTopHolders(
  type: string,
  collection: string,
): Promise<TopHoldersResult | null> {
  const [rawHolders, metrics, floors, discordMaps] = await Promise.all([
    buildRawHolders(),
    fetchTokenMetrics(),
    getFloorPrices(),
    getWalletDiscordMap(),
  ]);

  if (!metrics) {
    return null;
  }

  const { walletToDiscord, discordNames } = discordMaps;
  const tokenValueSol = metrics.tokenValue;
  const solPrice = metrics.solPrice;
  const collectionId = collection === "all" ? "all" : collection;

  const byKey = new Map<string, AggregatedHolder>();

  for (const holder of rawHolders) {
    const discordId = walletToDiscord.get(holder.wallet.toLowerCase()) ?? null;
    const key = discordId ?? holder.wallet;
    const existing = byKey.get(key);

    if (existing) {
      existing.buxBalance += holder.buxBalance;
      for (const config of collectionConfigs) {
        existing.nftCounts[config.id] =
          (existing.nftCounts[config.id] ?? 0) + (holder.nftCounts[config.id] ?? 0);
      }
      existing.totalNfts += holder.totalNfts;
    } else {
      byKey.set(key, {
        key,
        discordId,
        displayName: discordId
          ? discordNames.get(discordId) || "Discord user"
          : shortWallet(holder.wallet),
        buxBalance: holder.buxBalance,
        nftCounts: { ...holder.nftCounts },
        totalNfts: holder.totalNfts,
      });
    }
  }

  const rows: HolderRow[] = Array.from(byKey.values()).map((h) => {
    const nftCount =
      collectionId === "all" ? h.totalNfts : (h.nftCounts[collectionId] ?? 0);
    const buxSol = h.buxBalance * tokenValueSol;
    const nftsSol = nftSolValue(h, floors, collectionId);
    const totalSol =
      type === "bux" ? buxSol : type === "nfts" ? nftsSol : buxSol + nftsSol;
    const sortValue =
      type === "bux" ? h.buxBalance : type === "nfts" ? nftCount : totalSol;

    return {
      discord_id: h.discordId ?? h.key,
      discord_username: h.displayName,
      nfts: collectionId === "all" ? `${nftCount} NFTs` : String(nftCount),
      bux: h.buxBalance.toLocaleString(undefined, { maximumFractionDigits: 0 }),
      value: formatValue(totalSol, totalSol * solPrice),
      sortValue,
      buxBalance: h.buxBalance,
      nftCount,
    };
  });

  let filtered = rows;
  if (type === "bux") {
    filtered = rows.filter((r) => r.buxBalance > 0);
  } else if (type === "nfts") {
    filtered = rows.filter((r) => r.nftCount > 0);
  } else {
    filtered = rows.filter((r) => r.buxBalance > 0 || r.nftCount > 0);
  }

  filtered.sort((a, b) => b.sortValue - a.sortValue);

  const holders: HolderRow[] = filtered.slice(0, 100).map(
    ({ sortValue, ...row }) => row,
  );

  return {
    holders,
    availableCollections: [
      { value: "all", label: "All collections" },
      ...collectionConfigs.map((c) => ({ value: c.id, label: c.name })),
    ],
  };
}

import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { fetchStakingDepositors } from "@/lib/bux/staking-attribution";

import { resolveAssetImage, type DasAsset } from "@/lib/discord/helius";
import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";
import { fetchWalletBuxBalanceViaRpc } from "@/lib/solana/bux-token-accounts";

export type HubNft = {
  mint: string;
  name: string;
  number: number | null;
  image: string | null;
  staked: boolean;
};

export type HubWalletHoldings = {
  buxBalance: number;
  collections: Record<string, HubNft[]>;
};

async function heliusRpcSoft<T>(method: string, params: unknown): Promise<T | null> {
  if (!hasHeliusApiKey()) {
    return null;
  }
  return heliusRpc<T>(method, params, { softFail: true, timeoutMs: 15_000 });
}

function parseNftNumber(name: string): number | null {
  const match = name.match(/#\s*(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

async function assetToHubNft(asset: DasAsset, staked: boolean): Promise<HubNft | null> {
  const mint = asset.id;
  if (!mint) {
    return null;
  }
  const name = asset.content?.metadata?.name?.trim() || "Unknown";
  return {
    mint,
    name,
    number: parseNftNumber(name),
    image: await resolveAssetImage(asset),
    staked,
  };
}

function collectionMintFor(asset: DasAsset): string | null {
  const group = asset.grouping?.find((g) => g.group_key === "collection");
  return group?.group_value ?? null;
}

async function fetchAssetsByOwner(wallet: string): Promise<DasAsset[]> {
  const items: DasAsset[] = [];
  let page = 1;

  while (page <= 20) {
    const result = await heliusRpcSoft<{ items?: DasAsset[]; total?: number }>("getAssetsByOwner", {
      ownerAddress: wallet,
      page,
      limit: 1000,
      displayOptions: { showFungible: false, showNativeBalance: false },
    });
    if (!result) {
      break;
    }
    const batch = result.items ?? [];
    items.push(...batch);
    if (batch.length < 1000) {
      break;
    }
    page += 1;
  }

  return items;
}

/** Fetch DAS assets by mint id in small batches — avoids scanning whole collections. */
async function fetchAssetsByIds(mints: string[]): Promise<DasAsset[]> {
  if (mints.length === 0) {
    return [];
  }

  const assets: DasAsset[] = [];
  const chunkSize = 100;

  for (let i = 0; i < mints.length; i += chunkSize) {
    const ids = mints.slice(i, i + chunkSize);
    const batch = await heliusRpcSoft<Array<DasAsset | null>>("getAssetBatch", { ids });
    if (!batch) {
      continue;
    }
    for (const asset of batch) {
      if (asset?.id) {
        assets.push(asset);
      }
    }
  }

  return assets;
}

async function fetchStakedNftsForWallet(
  wallet: string,
  config: CollectionConfig,
): Promise<DasAsset[]> {
  if (!config.stakingWallet || !config.stakeLive) {
    return [];
  }

  const depositorMap = await fetchStakingDepositors(config.stakingWallet);
  const userMints = [...depositorMap.entries()]
    .filter(([, depositor]) => depositor === wallet)
    .map(([mint]) => mint);

  return fetchAssetsByIds(userMints);
}

function sortNfts(nfts: HubNft[]): HubNft[] {
  return [...nfts].sort((a, b) => {
    if (a.number != null && b.number != null) {
      return a.number - b.number;
    }
    if (a.number != null) {
      return -1;
    }
    if (b.number != null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

async function fetchBuxBalance(wallet: string): Promise<number> {
  try {
    return await fetchWalletBuxBalanceViaRpc(wallet);
  } catch (error) {
    console.error("[hub] BUX balance RPC failed:", error);
    return 0;
  }
}

export async function fetchHubWalletHoldings(wallet: string): Promise<HubWalletHoldings> {
  const mintToConfig = new Map(
    collectionConfigs.map((c) => [c.collectionMint, c] as const),
  );

  // Wallet NFTs first (one DAS call). Staked lookups use mint ids only — do not
  // scan entire collections (that was burning Helius credits and soft-failing to []).
  const [walletAssets, buxBalance] = await Promise.all([
    fetchAssetsByOwner(wallet),
    fetchBuxBalance(wallet),
  ]);

  const stakedByCollection = await Promise.all(
    collectionConfigs.map((config) => fetchStakedNftsForWallet(wallet, config)),
  );

  const collections: Record<string, HubNft[]> = Object.fromEntries(
    collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
  );

  const seenMints = new Set<string>();

  for (const asset of walletAssets) {
    const collectionMint = collectionMintFor(asset);
    const config = collectionMint ? mintToConfig.get(collectionMint) : undefined;
    if (!config) {
      continue;
    }
    const nft = await assetToHubNft(asset, false);
    if (!nft || seenMints.has(nft.mint)) {
      continue;
    }
    seenMints.add(nft.mint);
    collections[config.id].push(nft);
  }

  for (let index = 0; index < collectionConfigs.length; index += 1) {
    const config = collectionConfigs[index];
    for (const asset of stakedByCollection[index]) {
      const nft = await assetToHubNft(asset, true);
      if (!nft || seenMints.has(nft.mint)) {
        continue;
      }
      seenMints.add(nft.mint);
      collections[config.id].push(nft);
    }
  }

  for (const config of collectionConfigs) {
    collections[config.id] = sortNfts(collections[config.id]);
  }

  return { buxBalance, collections };
}

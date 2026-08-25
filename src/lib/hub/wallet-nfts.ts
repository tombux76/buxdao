import { collectionConfigs, type CollectionConfig } from "@/content/site";
import {
  fetchStakingDepositors,
  fetchWalletTransactionHistory,
} from "@/lib/bux/staking-attribution";

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
  const first = await heliusRpc<T>(method, params, { softFail: true, timeoutMs: 20_000 });
  if (first != null) {
    return first;
  }
  return heliusRpc<T>(method, params, { softFail: true, timeoutMs: 45_000 });
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

/** Unstaked NFTs for one collection — searchAssets is far cheaper than full-wallet DAS. */
async function fetchUnstakedCollectionAssets(
  wallet: string,
  collectionMint: string,
): Promise<DasAsset[]> {
  const items: DasAsset[] = [];
  let page = 1;

  while (page <= 10) {
    const result = await heliusRpcSoft<{ items?: DasAsset[] }>("searchAssets", {
      ownerAddress: wallet,
      grouping: ["collection", collectionMint],
      page,
      limit: 1000,
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

/** Fetch DAS assets by mint id in small batches. */
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

/**
 * Staked NFTs for this wallet in a pool.
 * Prefer user deposit/withdraw history + getAssetBatch ownership checks — do NOT
 * require a full pool getAssetsByOwner scan (that 429s and previously zeroed Hub).
 */
async function fetchStakedNftsForWallet(
  wallet: string,
  config: CollectionConfig,
  userTxs: Awaited<ReturnType<typeof fetchWalletTransactionHistory>>,
): Promise<DasAsset[]> {
  if (!config.stakingWallet || !config.stakeLive) {
    return [];
  }

  const stakingWallet = config.stakingWallet;
  const collectionMint = config.collectionMint;

  // Net deposits still attributed to this wallet from their own tx history.
  const held = new Set<string>();
  for (const tx of [...userTxs].reverse()) {
    for (const transfer of tx.tokenTransfers ?? []) {
      const mint = transfer.mint;
      if (!mint) {
        continue;
      }
      const isNft =
        transfer.tokenStandard?.includes("NonFungible") || transfer.tokenAmount === 1;
      if (!isNft) {
        continue;
      }
      if (transfer.fromUserAccount === wallet && transfer.toUserAccount === stakingWallet) {
        held.add(mint);
      }
      if (transfer.fromUserAccount === stakingWallet && transfer.toUserAccount === wallet) {
        held.delete(mint);
      }
    }
  }

  let candidateMints = [...held];

  // Fallback: recent pool depositor map when user history is empty/truncated.
  if (candidateMints.length === 0) {
    const depositorMap = await fetchStakingDepositors(stakingWallet);
    candidateMints = [...depositorMap.entries()]
      .filter(([, depositor]) => depositor.toLowerCase() === wallet.toLowerCase())
      .map(([mint]) => mint);
  }

  if (candidateMints.length === 0) {
    return [];
  }

  const assets = await fetchAssetsByIds(candidateMints);
  return assets.filter((asset) => {
    const owner = asset.ownership?.owner?.toLowerCase();
    if (owner !== stakingWallet.toLowerCase()) {
      return false;
    }
    return asset.grouping?.some(
      (g) => g.group_key === "collection" && g.group_value === collectionMint,
    );
  });
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
  const [buxBalance, userTxs] = await Promise.all([
    fetchBuxBalance(wallet),
    fetchWalletTransactionHistory(wallet),
  ]);

  const collections: Record<string, HubNft[]> = Object.fromEntries(
    collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
  );
  const seenMints = new Set<string>();

  // Sequential per collection — avoids blasting all keys with parallel DAS/REST.
  for (const config of collectionConfigs) {
    const unstaked = await fetchUnstakedCollectionAssets(wallet, config.collectionMint);
    for (const asset of unstaked) {
      const nft = await assetToHubNft(asset, false);
      if (!nft || seenMints.has(nft.mint)) {
        continue;
      }
      seenMints.add(nft.mint);
      collections[config.id].push(nft);
    }

    const staked = await fetchStakedNftsForWallet(wallet, config, userTxs);
    for (const asset of staked) {
      const nft = await assetToHubNft(asset, true);
      if (!nft || seenMints.has(nft.mint)) {
        continue;
      }
      seenMints.add(nft.mint);
      collections[config.id].push(nft);
    }

    collections[config.id] = sortNfts(collections[config.id]);
  }

  return { buxBalance, collections };
}

import { collectionConfigs } from "@/content/site";
import { resolveAssetImage, type DasAsset } from "@/lib/discord/helius";
import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";
import { fetchGravestakeWalletPositions } from "@/lib/gravestake";
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

/** Unstaked / soft-staked NFTs still owned by the wallet for one collection. */
async function fetchWalletCollectionAssets(
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
  const poolByWallet = new Map(
    collectionConfigs
      .filter((c) => c.stakingWallet)
      .map((c) => [c.stakingWallet!.toLowerCase(), c] as const),
  );

  const [buxBalance, positions] = await Promise.all([
    fetchBuxBalance(wallet),
    fetchGravestakeWalletPositions(wallet),
  ]);

  // Mints actively staked in each of our pools (soft-stake + custody).
  const stakedMintsByCollection = new Map<string, Set<string>>();
  for (const config of collectionConfigs) {
    stakedMintsByCollection.set(config.id, new Set());
  }
  for (const position of positions) {
    const config = poolByWallet.get(position.pool_pubkey.toLowerCase());
    if (!config) {
      continue;
    }
    stakedMintsByCollection.get(config.id)!.add(position.asset_mint);
  }

  const collections: Record<string, HubNft[]> = Object.fromEntries(
    collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
  );
  const seenMints = new Set<string>();

  for (const config of collectionConfigs) {
    const stakedMints = stakedMintsByCollection.get(config.id) ?? new Set<string>();
    const inWallet = await fetchWalletCollectionAssets(wallet, config.collectionMint);

    for (const asset of inWallet) {
      const nft = await assetToHubNft(asset, stakedMints.has(asset.id!));
      if (!nft || seenMints.has(nft.mint)) {
        continue;
      }
      seenMints.add(nft.mint);
      collections[config.id].push(nft);
    }

    // Custody stakes (e.g. Money Monsters mode 1) leave the user wallet — add those too.
    const missingStaked = [...stakedMints].filter((mint) => !seenMints.has(mint));
    if (missingStaked.length > 0) {
      const assets = await fetchAssetsByIds(missingStaked);
      for (const asset of assets) {
        const nft = await assetToHubNft(asset, true);
        if (!nft || seenMints.has(nft.mint)) {
          continue;
        }
        seenMints.add(nft.mint);
        collections[config.id].push(nft);
      }
    }

    collections[config.id] = sortNfts(collections[config.id]);
  }

  return { buxBalance, collections };
}

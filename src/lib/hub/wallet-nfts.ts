import { collectionConfigs } from "@/content/site";
import { resolveAssetImage, type DasAsset } from "@/lib/discord/helius";
import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";
import { fetchGravestakeWalletPositions } from "@/lib/gravestake";
import {
  loadCollectionAssetsByMints,
  saveCatalogEntries,
  saveCollectionAssets,
  type CachedCollectionAsset,
} from "@/lib/hub/collection-assets";
import {
  fetchWalletBuxBalanceViaRpc,
  fetchWalletNftMintsViaRpc,
} from "@/lib/solana/bux-token-accounts";
import { fetchOnChainNftMetadata } from "@/lib/solana/nft-metadata";

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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Off-chain JSON image lookups stop after this budget; missing images retry on the next load. */
const IMAGE_BUDGET_MS = 12_000;

/** Ownership + collection + name straight from chain (standard RPC); images cached in Postgres. */
async function holdingsFromChain(
  walletMints: string[],
  stakedMintsByCollection: Map<string, Set<string>>,
): Promise<Record<string, HubNft[]>> {
  const configIdByCollectionMint = new Map(
    collectionConfigs.map((c) => [c.collectionMint, c.id] as const),
  );
  const stakedConfigIdByMint = new Map<string, string>();
  for (const [configId, mints] of stakedMintsByCollection) {
    for (const mint of mints) {
      stakedConfigIdByMint.set(mint, configId);
    }
  }

  const candidates = [...new Set([...walletMints, ...stakedConfigIdByMint.keys()])];
  const metadata = await fetchOnChainNftMetadata(candidates);

  const entries: { mint: string; configId: string; name: string; uri: string }[] = [];
  for (const mint of candidates) {
    const meta = metadata.get(mint);
    if (!meta) {
      continue;
    }
    const configId =
      (meta.collection && configIdByCollectionMint.get(meta.collection)) ||
      stakedConfigIdByMint.get(mint);
    if (configId) {
      entries.push({ mint, configId, name: meta.name, uri: meta.uri });
    }
  }

  const catalog = await loadCollectionAssetsByMints(entries.map((e) => e.mint)).catch(
    (error) => {
      console.error("[hub] collection asset cache load failed:", error);
      return new Map<string, CachedCollectionAsset>();
    },
  );

  const deadline = Date.now() + IMAGE_BUDGET_MS;
  const newCatalogRows: CachedCollectionAsset[] = [];
  const nfts = await mapWithConcurrency(entries, 8, async (entry) => {
    let image = catalog.get(entry.mint)?.image ?? null;
    if (!image && entry.uri && Date.now() < deadline) {
      image = await resolveAssetImage({ id: entry.mint, content: { json_uri: entry.uri } });
      if (image) {
        newCatalogRows.push({
          mint: entry.mint,
          collectionId: entry.configId,
          name: entry.name,
          image,
          jsonUri: entry.uri,
        });
      }
    }
    return {
      configId: entry.configId,
      nft: {
        mint: entry.mint,
        name: entry.name,
        number: parseNftNumber(entry.name),
        image,
        staked: stakedMintsByCollection.get(entry.configId)?.has(entry.mint) ?? false,
      } satisfies HubNft,
    };
  });

  await saveCatalogEntries(newCatalogRows);

  const collections: Record<string, HubNft[]> = Object.fromEntries(
    collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
  );
  for (const { configId, nft } of nfts) {
    collections[configId]!.push(nft);
  }
  for (const id of Object.keys(collections)) {
    collections[id] = sortNfts(collections[id]!);
  }
  return collections;
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

async function holdingsFromDas(
  wallet: string,
  stakedMintsByCollection: Map<string, Set<string>>,
): Promise<Record<string, HubNft[]>> {
  const collections: Record<string, HubNft[]> = Object.fromEntries(
    collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
  );
  const seenMints = new Set<string>();

  for (const config of collectionConfigs) {
    const stakedMints = stakedMintsByCollection.get(config.id) ?? new Set<string>();
    const inWallet = await fetchWalletCollectionAssets(wallet, config.collectionMint);
    await saveCollectionAssets(config.id, inWallet);

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
      await saveCollectionAssets(config.id, assets);
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

  return collections;
}

export async function fetchHubWalletHoldings(wallet: string): Promise<HubWalletHoldings> {
  const poolByWallet = new Map(
    collectionConfigs
      .filter((c) => c.stakingWallet)
      .map((c) => [c.stakingWallet!.toLowerCase(), c] as const),
  );

  const [buxBalance, positions, walletMints] = await Promise.all([
    fetchBuxBalance(wallet),
    fetchGravestakeWalletPositions(wallet),
    fetchWalletNftMintsViaRpc(wallet).catch((error) => {
      console.error("[hub] token account RPC failed, falling back to DAS:", error);
      return null;
    }),
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

  if (walletMints) {
    try {
      return {
        buxBalance,
        collections: await holdingsFromChain(walletMints, stakedMintsByCollection),
      };
    } catch (error) {
      console.error("[hub] on-chain metadata failed, falling back to DAS:", error);
    }
  }

  return { buxBalance, collections: await holdingsFromDas(wallet, stakedMintsByCollection) };
}

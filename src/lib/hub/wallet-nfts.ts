import { collectionConfigs, tokenConfig, type CollectionConfig } from "@/content/site";
import { fetchStakingDepositors } from "@/lib/bux/staking-attribution";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const HELIUS_RPC = "https://mainnet.helius-rpc.com";

type DasAsset = {
  id?: string;
  ownership?: { owner?: string };
  content?: {
    metadata?: { name?: string };
    links?: { image?: string };
  };
  grouping?: { group_key?: string; group_value?: string }[];
};

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

async function heliusRpc<T>(method: string, params: unknown): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${HELIUS_RPC}/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { result?: T };
    return payload.result ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseNftNumber(name: string): number | null {
  const match = name.match(/#\s*(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function assetToHubNft(asset: DasAsset, staked: boolean): HubNft | null {
  const mint = asset.id;
  if (!mint) {
    return null;
  }
  const name = asset.content?.metadata?.name?.trim() || "Unknown";
  return {
    mint,
    name,
    number: parseNftNumber(name),
    image: asset.content?.links?.image ?? null,
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
    const result = await heliusRpc<{ items?: DasAsset[]; total?: number }>("getAssetsByOwner", {
      ownerAddress: wallet,
      page,
      limit: 1000,
      displayOptions: { showFungible: false, showNativeBalance: false },
    });
    const batch = result?.items ?? [];
    items.push(...batch);
    if (batch.length < 1000) {
      break;
    }
    page += 1;
  }

  return items;
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

  if (userMints.length === 0) {
    return [];
  }

  const mintSet = new Set(userMints);
  const assets: DasAsset[] = [];
  let page = 1;

  while (page <= 50) {
    const result = await heliusRpc<{ items?: DasAsset[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: config.collectionMint,
      page,
      limit: 1000,
    });
    const batch = result?.items ?? [];
    for (const asset of batch) {
      if (asset.id && mintSet.has(asset.id)) {
        assets.push(asset);
      }
    }
    if (batch.length < 1000) {
      break;
    }
    page += 1;
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
  const mint = tokenConfig.mint;
  const result = await heliusRpc<{ account: { data: string | [string, string] } }[]>(
    "getProgramAccounts",
    [
      TOKEN_PROGRAM_ID.toBase58(),
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
          { memcmp: { offset: 32, bytes: wallet } },
        ],
      },
    ],
  );

  if (!result?.length) {
    return 0;
  }

  let total = 0;
  for (const item of result) {
    const raw = item.account?.data;
    if (!raw) {
      continue;
    }
    const dataBase64 = Array.isArray(raw) ? raw[0] : raw;
    try {
      const buf = Buffer.from(dataBase64, "base64");
      if (buf.length >= 72) {
        total += Number(buf.readBigUInt64LE(64));
      }
    } catch {
      // skip
    }
  }

  return total / 1e9;
}

export async function fetchHubWalletHoldings(wallet: string): Promise<HubWalletHoldings> {
  const mintToConfig = new Map(
    collectionConfigs.map((c) => [c.collectionMint, c] as const),
  );

  const [walletAssets, buxBalance, ...stakedByCollection] = await Promise.all([
    fetchAssetsByOwner(wallet),
    fetchBuxBalance(wallet),
    ...collectionConfigs.map((config) => fetchStakedNftsForWallet(wallet, config)),
  ]);

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
    const nft = assetToHubNft(asset, false);
    if (!nft || seenMints.has(nft.mint)) {
      continue;
    }
    seenMints.add(nft.mint);
    collections[config.id].push(nft);
  }

  collectionConfigs.forEach((config, index) => {
    for (const asset of stakedByCollection[index]) {
      const nft = assetToHubNft(asset, true);
      if (!nft || seenMints.has(nft.mint)) {
        continue;
      }
      seenMints.add(nft.mint);
      collections[config.id].push(nft);
    }
  });

  for (const config of collectionConfigs) {
    collections[config.id] = sortNfts(collections[config.id]);
  }

  return { buxBalance, collections };
}

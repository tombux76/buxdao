import { collectionConfigs, tokenConfig, type CollectionConfig } from "@/content/site";
import {
  loadNftHolderSnapshot,
  saveNftHolderSnapshot,
} from "@/lib/bux/nft-holder-snapshot";
import { fetchStakingDepositors } from "@/lib/bux/staking-attribution";
import {
  fetchAllBuxTokenAccountsViaRpc,
  type BuxTokenAccountSlice,
} from "@/lib/solana/bux-token-accounts";
import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";

type NftOwnerItem = {
  id?: string;
  ownership?: { owner?: string };
};

async function heliusRpcSoft<T>(method: string, params: unknown, timeoutMs = 20_000): Promise<T | null> {
  if (!hasHeliusApiKey()) {
    return null;
  }
  return heliusRpc<T>(method, params, { softFail: true, timeoutMs });
}

export type RawHolder = {
  wallet: string;
  buxBalance: number;
  nftCounts: Record<string, number>;
  totalNfts: number;
};

export async function fetchAllBuxTokenAccounts(): Promise<BuxTokenAccountSlice[]> {
  try {
    return await fetchAllBuxTokenAccountsViaRpc();
  } catch (error) {
    console.error("[bux-holders] getProgramAccounts failed:", error);
    return [];
  }
}

async function fetchResolvedNftCountsByOwner(
  config: CollectionConfig,
  options: { allowSnapshot?: boolean } = {},
): Promise<Map<string, number>> {
  const allowSnapshot = options.allowSnapshot !== false;
  const counts = new Map<string, number>();
  const collectionMint = config.collectionMint;
  if (!collectionMint) {
    return counts;
  }

  const stakingWallet = config.stakingWallet?.toLowerCase();
  const depositorMap = stakingWallet
    ? await fetchStakingDepositors(config.stakingWallet!)
    : null;

  let page = 1;
  let dasFailed = false;
  let sawItems = false;
  while (page <= 50) {
    const result = await heliusRpcSoft<{ items?: NftOwnerItem[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionMint,
      page,
      limit: 1000,
    });

    if (!result) {
      dasFailed = true;
      break;
    }

    const items = result.items ?? [];
    if (items.length > 0) {
      sawItems = true;
    }
    for (const item of items) {
      const onChainOwner = item.ownership?.owner;
      const mint = item.id;
      if (!onChainOwner || !mint) {
        continue;
      }

      let attributedOwner = onChainOwner;

      if (stakingWallet && onChainOwner.toLowerCase() === stakingWallet) {
        attributedOwner = depositorMap?.get(mint) ?? "";
        if (!attributedOwner) {
          continue;
        }
      }

      if (isHiddenWallet(attributedOwner)) {
        continue;
      }

      counts.set(attributedOwner, (counts.get(attributedOwner) ?? 0) + 1);
    }

    if (items.length < 1000) {
      break;
    }
    page += 1;
  }

  if (sawItems && counts.size > 0) {
    await saveNftHolderSnapshot(config.id, counts);
    return counts;
  }

  // Snapshots are display-only fallbacks (leaderboard). Never use them for
  // cashout / prize eligibility — those must reflect live ownership.
  if (allowSnapshot && (dasFailed || counts.size === 0)) {
    const snapshot = await loadNftHolderSnapshot(config.id);
    if (snapshot && snapshot.size > 0) {
      console.warn(
        `[bux-holders] using NFT snapshot for ${config.id} (live DAS ${dasFailed ? "failed" : "empty"})`,
      );
      return snapshot;
    }
  }

  return counts;
}

export type BuildRawHoldersOptions = {
  /** When false, skip Postgres snapshot fallback (live DAS only). Default true. */
  allowSnapshot?: boolean;
};

export async function buildRawHolders(
  options: BuildRawHoldersOptions = {},
): Promise<RawHolder[]> {
  const holderMap = new Map<string, RawHolder>();

  function getOrCreate(wallet: string): RawHolder {
    let holder = holderMap.get(wallet);
    if (!holder) {
      holder = {
        wallet,
        buxBalance: 0,
        nftCounts: Object.fromEntries(collectionConfigs.map((c) => [c.id, 0])),
        totalNfts: 0,
      };
      holderMap.set(wallet, holder);
    }
    return holder;
  }

  const tokenAccounts = await fetchAllBuxTokenAccounts();
  for (const account of tokenAccounts) {
    const holder = getOrCreate(account.owner);
    holder.buxBalance += account.amount;
  }

  // Sequential DAS scans — parallel collection fetches 429 Helius and soft-fail to 0 NFTs.
  const nftResults: { id: string; ownerCounts: Map<string, number> }[] = [];
  for (const config of collectionConfigs) {
    nftResults.push({
      id: config.id,
      ownerCounts: await fetchResolvedNftCountsByOwner(config, {
        allowSnapshot: options.allowSnapshot,
      }),
    });
  }

  for (const { id, ownerCounts } of nftResults) {
    for (const [owner, count] of ownerCounts) {
      if (isHiddenWallet(owner)) {
        continue;
      }
      const holder = getOrCreate(owner);
      holder.nftCounts[id] = (holder.nftCounts[id] ?? 0) + count;
      holder.totalNfts += count;
    }
  }

  return Array.from(holderMap.values());
}

export function isHiddenWallet(wallet: string): boolean {
  return isExemptWallet(wallet) || isStakingWallet(wallet);
}

export function isExemptWallet(wallet: string): boolean {
  const lower = wallet.toLowerCase();
  return tokenConfig.exemptWallets.some((w) => w.toLowerCase() === lower);
}

/** BUX in staking pool wallets is not public circulating supply */
export function isNonPublicSupplyWallet(wallet: string): boolean {
  return isExemptWallet(wallet) || isStakingWallet(wallet);
}

/** Staking pool wallets — hidden from leaderboards, NFTs attributed to depositors */
export function isStakingWallet(wallet: string): boolean {
  const lower = wallet.toLowerCase();
  return collectionConfigs.some((c) => c.stakingWallet?.toLowerCase() === lower);
}

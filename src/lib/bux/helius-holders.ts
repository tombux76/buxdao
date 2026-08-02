import { collectionConfigs, tokenConfig, type CollectionConfig } from "@/content/site";
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

async function heliusRpcSoft<T>(method: string, params: unknown, timeoutMs = 12_000): Promise<T | null> {
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

async function fetchResolvedNftCountsByOwner(config: CollectionConfig): Promise<Map<string, number>> {
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
  while (page <= 50) {
    const result = await heliusRpcSoft<{ items?: NftOwnerItem[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionMint,
      page,
      limit: 1000,
    });

    const items = result?.items ?? [];
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

  return counts;
}

export async function buildRawHolders(): Promise<RawHolder[]> {
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

  const nftResults = await Promise.all(
    collectionConfigs.map(async (config) => ({
      id: config.id,
      ownerCounts: await fetchResolvedNftCountsByOwner(config),
    })),
  );

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

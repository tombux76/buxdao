import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { collectionConfigs, tokenConfig, type CollectionConfig } from "@/content/site";
import { fetchStakingDepositors } from "@/lib/bux/staking-attribution";
import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";
const BUX_DECIMALS = 9;

type TokenAccountSlice = {
  pubkey: string;
  owner: string;
  amount: number;
};

type NftOwnerItem = {
  id?: string;
  ownership?: { owner?: string };
};

function decodeTokenAccountOwnerAndAmount(dataBase64: string): { owner: string; amount: number } | null {
  try {
    const buf = Buffer.from(dataBase64, "base64");
    if (buf.length < 40) {
      return null;
    }
    const owner = new PublicKey(buf.subarray(0, 32)).toBase58();
    const amount = Number(buf.readBigUInt64LE(32));
    return { owner, amount };
  } catch {
    return null;
  }
}

async function heliusRpcSoft<T>(method: string, params: unknown, timeoutMs = 30_000): Promise<T | null> {
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

export async function fetchAllBuxTokenAccounts(): Promise<TokenAccountSlice[]> {
  const mint = tokenConfig.mint;
  const result = await heliusRpcSoft<{ account: { data: string | [string, string] } }[]>(
    "getProgramAccounts",
    [
      TOKEN_PROGRAM_ID.toBase58(),
      {
        encoding: "base64",
        commitment: "confirmed",
        filters: [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: mint } },
        ],
        dataSlice: { offset: 32, length: 40 },
      },
    ],
    45_000,
  );

  if (!result) {
    return [];
  }

  const accounts: TokenAccountSlice[] = [];
  for (const item of result) {
    const raw = item.account?.data;
    if (!raw) {
      continue;
    }
    const dataBase64 = Array.isArray(raw) ? raw[0] : raw;
    const decoded = decodeTokenAccountOwnerAndAmount(dataBase64);
    if (!decoded || decoded.amount === 0) {
      continue;
    }
    accounts.push({
      pubkey: "",
      owner: decoded.owner,
      amount: decoded.amount / 10 ** BUX_DECIMALS,
    });
  }

  return accounts;
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

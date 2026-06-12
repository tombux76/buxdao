import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { collectionConfigs, tokenConfig } from "@/content/site";

const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const BUX_DECIMALS = 9;

type TokenAccountSlice = {
  pubkey: string;
  owner: string;
  amount: number;
};

type NftOwnerItem = {
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

async function heliusRpc<T>(method: string, params: unknown, timeoutMs = 30_000): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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

export type RawHolder = {
  wallet: string;
  buxBalance: number;
  nftCounts: Record<string, number>;
  totalNfts: number;
};

export async function fetchAllBuxTokenAccounts(): Promise<TokenAccountSlice[]> {
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

export async function fetchNftCountsByOwner(collectionMint: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!collectionMint) {
    return counts;
  }

  let page = 1;
  while (page <= 50) {
    const result = await heliusRpc<{ items?: NftOwnerItem[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionMint,
      page,
      limit: 1000,
    });

    const items = result?.items ?? [];
    for (const item of items) {
      const owner = item.ownership?.owner;
      if (owner) {
        counts.set(owner, (counts.get(owner) ?? 0) + 1);
      }
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
      ownerCounts: await fetchNftCountsByOwner(config.collectionMint),
    })),
  );

  for (const { id, ownerCounts } of nftResults) {
    for (const [owner, count] of ownerCounts) {
      const holder = getOrCreate(owner);
      holder.nftCounts[id] = (holder.nftCounts[id] ?? 0) + count;
      holder.totalNfts += count;
    }
  }

  return Array.from(holderMap.values());
}

export function isExemptWallet(wallet: string): boolean {
  const lower = wallet.toLowerCase();
  return tokenConfig.exemptWallets.some((w) => w.toLowerCase() === lower);
}

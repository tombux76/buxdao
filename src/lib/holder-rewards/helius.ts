const HELIUS_RPC = "https://mainnet.helius-rpc.com";

export type DasAsset = {
  id?: string;
  ownership?: { owner?: string };
  grouping?: { group_key?: string; group_value?: string }[];
};

export async function heliusRpc<T>(method: string, params: unknown): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is required for holder rewards");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${HELIUS_RPC}/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Helius RPC failed (${response.status})`);
    }
    const payload = (await response.json()) as { result?: T; error?: { message?: string } };
    if (payload.error) {
      throw new Error(payload.error.message ?? "Helius RPC error");
    }
    return payload.result ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

export function collectionMintFor(asset: DasAsset): string | null {
  const group = asset.grouping?.find((g) => g.group_key === "collection");
  return group?.group_value ?? null;
}

export async function fetchAssetsByOwner(wallet: string): Promise<DasAsset[]> {
  const items: DasAsset[] = [];
  let page = 1;

  while (page <= 20) {
    const result = await heliusRpc<{ items?: DasAsset[] }>("getAssetsByOwner", {
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

export async function fetchAssetOwner(mint: string): Promise<string | null> {
  const result = await heliusRpc<{ ownership?: { owner?: string } }>("getAsset", { id: mint });
  return result?.ownership?.owner ?? null;
}

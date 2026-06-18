export type DasAsset = {
  id?: string;
  ownership?: { owner?: string };
  content?: {
    metadata?: { name?: string; attributes?: { trait_type?: string; value?: string | number }[] };
    links?: { image?: string };
    json_uri?: string;
  };
  grouping?: { group_key?: string; group_value?: string }[];
};

const HELIUS_RPC = "https://mainnet.helius-rpc.com";

export async function heliusRpc<T>(method: string, params: unknown): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is not configured");
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

export async function fetchAsset(mint: string): Promise<DasAsset | null> {
  return heliusRpc<DasAsset>("getAsset", { id: mint });
}

export async function fetchAssetsByGroup(collectionMint: string): Promise<DasAsset[]> {
  const items: DasAsset[] = [];
  let page = 1;

  while (page <= 50) {
    const result = await heliusRpc<{ items?: DasAsset[] }>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionMint,
      page,
      limit: 1000,
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

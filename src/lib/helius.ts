const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const REVALIDATE_SECONDS = 300;

type HeliusAssetsResult = {
  items?: unknown[];
};

async function heliusRpc<T>(method: string, params: unknown): Promise<T | null> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${HELIUS_RPC}/?api-key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
      next: { revalidate: REVALIDATE_SECONDS },
      signal: controller.signal,
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

/** Count minted NFTs in a collection via Helius DAS (same approach as absurd-apes). */
export async function fetchCollectionSupply(collectionMint: string): Promise<number | null> {
  if (!collectionMint || !process.env.HELIUS_API_KEY) {
    return null;
  }

  let page = 1;
  let totalItems = 0;

  while (page <= 50) {
    const result = await heliusRpc<HeliusAssetsResult>("getAssetsByGroup", {
      groupKey: "collection",
      groupValue: collectionMint,
      page,
      limit: 1000,
    });

    const items = result?.items ?? [];
    totalItems += items.length;

    if (items.length < 1000) {
      break;
    }

    page += 1;
  }

  return totalItems > 0 ? totalItems : null;
}

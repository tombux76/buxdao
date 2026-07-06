import { heliusRpc, hasHeliusApiKey } from "@/lib/helius-rpc";

const REVALIDATE_SECONDS = 300;

type HeliusAssetsResult = {
  items?: unknown[];
};

/** Count minted NFTs in a collection via Helius DAS (same approach as absurd-apes). */
export async function fetchCollectionSupply(collectionMint: string): Promise<number | null> {
  if (!collectionMint || !hasHeliusApiKey()) {
    return null;
  }

  let page = 1;
  let totalItems = 0;

  while (page <= 50) {
    const result = await heliusRpc<HeliusAssetsResult>(
      "getAssetsByGroup",
      {
        groupKey: "collection",
        groupValue: collectionMint,
        page,
        limit: 1000,
      },
      { softFail: true, timeoutMs: 15_000, nextRevalidate: REVALIDATE_SECONDS },
    );

    const items = result?.items ?? [];
    totalItems += items.length;

    if (items.length < 1000) {
      break;
    }

    page += 1;
  }

  return totalItems > 0 ? totalItems : null;
}

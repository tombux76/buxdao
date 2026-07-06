import { heliusRpc } from "@/lib/helius-rpc";

export type DasAsset = {
  id?: string;
  ownership?: { owner?: string };
  grouping?: { group_key?: string; group_value?: string }[];
};

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

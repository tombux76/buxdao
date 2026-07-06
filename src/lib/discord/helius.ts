export type DasAsset = {
  id?: string;
  ownership?: { owner?: string };
  content?: {
    metadata?: { name?: string; attributes?: { trait_type?: string; value?: string | number }[] };
    links?: { image?: string };
    files?: { uri?: string; cdn_uri?: string; mime?: string }[];
    json_uri?: string;
  };
  grouping?: { group_key?: string; group_value?: string }[];
};

const METADATA_IMAGE_CACHE = new Map<string, string | null>();

function normalizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  return trimmed;
}

function imageFromAssetContent(content: NonNullable<DasAsset["content"]>): string | null {
  const linkImage = content.links?.image?.trim();
  if (linkImage) {
    return normalizeImageUrl(linkImage);
  }

  const file = content.files?.[0];
  const fileUri = file?.cdn_uri?.trim() || file?.uri?.trim();
  if (fileUri) {
    return normalizeImageUrl(fileUri);
  }

  return null;
}

async function fetchMetadataImage(jsonUri: string): Promise<string | null> {
  const cached = METADATA_IMAGE_CACHE.get(jsonUri);
  if (cached !== undefined) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(jsonUri, { signal: controller.signal, cache: "force-cache" });
    if (!response.ok) {
      METADATA_IMAGE_CACHE.set(jsonUri, null);
      return null;
    }

    const metadata = (await response.json()) as { image?: unknown };
    const image =
      typeof metadata.image === "string" && metadata.image.trim()
        ? normalizeImageUrl(metadata.image)
        : null;
    METADATA_IMAGE_CACHE.set(jsonUri, image);
    return image;
  } catch {
    METADATA_IMAGE_CACHE.set(jsonUri, null);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/** Helius DAS image, with off-chain metadata fallback (e.g. A.I. BitBots). */
export async function resolveAssetImage(asset: DasAsset | null | undefined): Promise<string | null> {
  if (!asset?.content) {
    return null;
  }

  const direct = imageFromAssetContent(asset.content);
  if (direct) {
    return direct;
  }

  const jsonUri = asset.content.json_uri?.trim();
  if (!jsonUri) {
    return null;
  }

  return fetchMetadataImage(jsonUri);
}

import { heliusRpc } from "@/lib/helius-rpc";

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

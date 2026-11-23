import { heliusRpc } from "@/lib/helius-rpc";
import { fetchOnChainNftMetadata } from "@/lib/solana/nft-metadata";

export type DasAsset = {
  id?: string;
  ownership?: {
    owner?: string;
    delegate?: string | null;
    delegated?: boolean;
    frozen?: boolean;
  };
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

function metadataFetchCandidates(jsonUri: string): string[] {
  const trimmed = jsonUri.trim();
  const candidates = [trimmed];
  // Arweave can be slow/flaky on the primary host — try a common gateway too.
  if (trimmed.startsWith("https://arweave.net/")) {
    candidates.push(`https://arweave.dev/${trimmed.slice("https://arweave.net/".length)}`);
  }
  return candidates;
}

async function fetchMetadataImage(jsonUri: string): Promise<string | null> {
  const cached = METADATA_IMAGE_CACHE.get(jsonUri);
  if (cached !== undefined) {
    return cached;
  }

  for (const url of metadataFetchCandidates(jsonUri)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        continue;
      }

      const metadata = (await response.json()) as { image?: unknown };
      const image =
        typeof metadata.image === "string" && metadata.image.trim()
          ? normalizeImageUrl(metadata.image)
          : null;
      if (image) {
        METADATA_IMAGE_CACHE.set(jsonUri, image);
        return image;
      }
    } catch {
      // try next candidate
    } finally {
      clearTimeout(timeout);
    }
  }

  METADATA_IMAGE_CACHE.set(jsonUri, null);
  return null;
}

/** Helius DAS image, with off-chain metadata fallback (e.g. A.I. BitBots / MM3D). */
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

/** Soft-fail DAS lookup — never throws when Helius is out of credits. */
export async function fetchAsset(mint: string): Promise<DasAsset | null> {
  try {
    return await heliusRpc<DasAsset>("getAsset", { id: mint }, { softFail: true });
  } catch {
    return null;
  }
}

/** Name / image / owner with on-chain Metaplex fallback when DAS is empty or down. */
export async function resolveNftDisplay(
  mint: string,
  asset?: DasAsset | null,
): Promise<{
  name: string | null;
  image: string | null;
  owner: string | null;
  delegate: string | null;
}> {
  const live = asset === undefined ? await fetchAsset(mint) : asset;
  let name = live?.content?.metadata?.name?.trim() || null;
  let image = await resolveAssetImage(live);
  const owner = live?.ownership?.owner?.trim() || null;
  const delegate = live?.ownership?.delegate?.trim() || null;

  if (name && image) {
    return { name, image, owner, delegate };
  }

  try {
    const onChain = await fetchOnChainNftMetadata([mint]);
    const meta = onChain.get(mint);
    if (!name && meta?.name) {
      name = meta.name;
    }
    if (!image && meta?.uri) {
      image = await resolveAssetImage({ content: { json_uri: meta.uri } });
    }
  } catch {
    // keep whatever we have
  }

  return { name, image, owner, delegate };
}

export async function fetchAssetsByGroup(collectionMint: string): Promise<DasAsset[]> {
  const items: DasAsset[] = [];
  let page = 1;

  while (page <= 50) {
    const result = await heliusRpc<{ items?: DasAsset[] }>(
      "getAssetsByGroup",
      {
        groupKey: "collection",
        groupValue: collectionMint,
        page,
        limit: 1000,
      },
      { softFail: true },
    );
    const batch = result?.items ?? [];
    items.push(...batch);
    if (batch.length < 1000) {
      break;
    }
    page += 1;
  }

  return items;
}

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
    const id = trimmed.slice("https://arweave.net/".length).split(/[/?#]/)[0] ?? "";
    if (id) {
      candidates.push(`https://arweave.dev/${id}`);
    }
  }
  return candidates;
}

function absoluteRedirectUrl(current: string, location: string): string {
  if (location.startsWith("//")) {
    return `https:${location}`;
  }
  if (location.startsWith("/")) {
    return new URL(location, current).href;
  }
  return location;
}

/** Parse Arweave's JSON redirect body when Accept: application/json strips Location. */
async function redirectUrlFromResponse(
  current: string,
  response: Response,
): Promise<string | null> {
  const header = response.headers.get("location");
  if (header) {
    return absoluteRedirectUrl(current, header);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json") && !contentType.includes("text")) {
    return null;
  }
  try {
    const text = await response.text();
    const fromJson = (() => {
      try {
        const payload = JSON.parse(text) as { body?: unknown };
        return typeof payload.body === "string" ? payload.body : text;
      } catch {
        return text;
      }
    })();
    const match = fromJson.match(/\/\/[^\s"'<>]+/);
    return match ? absoluteRedirectUrl(current, match[0]!) : null;
  } catch {
    return null;
  }
}

/** Node fetch often fails to follow Arweave's protocol-relative `Location: //…` redirects. */
async function fetchFollowingRedirects(
  url: string,
  init?: RequestInit,
): Promise<{ response: Response; finalUrl: string }> {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current };
    }
    const next = await redirectUrlFromResponse(current, response);
    if (!next) {
      return { response, finalUrl: current };
    }
    current = next;
  }
  throw new Error(`Too many redirects for ${url}`);
}

/** Prefer Arweave tx-subdomain URLs so Discord's image proxy can load them. */
async function canonicalizeMediaUrl(url: string): Promise<string> {
  if (!/^https:\/\/arweave\.net\//i.test(url)) {
    return url;
  }
  try {
    const { finalUrl } = await fetchFollowingRedirects(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
    });
    return finalUrl || url;
  } catch {
    return url;
  }
}

/** Resolve `image` from an off-chain metadata JSON URI (Arweave / IPFS / HTTPS). */
export async function resolveImageFromJsonUri(jsonUri: string): Promise<string | null> {
  const trimmed = jsonUri.trim();
  if (!trimmed) {
    return null;
  }

  const cached = METADATA_IMAGE_CACHE.get(trimmed);
  if (cached !== undefined) {
    return cached;
  }

  for (const url of metadataFetchCandidates(trimmed)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      // Avoid Accept: application/json — arweave.net then returns a JSON 302 without Location.
      const { response } = await fetchFollowingRedirects(url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "*/*" },
      });
      if (!response.ok) {
        continue;
      }

      const metadata = (await response.json()) as { image?: unknown };
      const rawImage =
        typeof metadata.image === "string" && metadata.image.trim()
          ? normalizeImageUrl(metadata.image)
          : null;
      if (rawImage) {
        const image = await canonicalizeMediaUrl(rawImage);
        METADATA_IMAGE_CACHE.set(trimmed, image);
        return image;
      }
    } catch {
      // try next candidate
    } finally {
      clearTimeout(timeout);
    }
  }

  METADATA_IMAGE_CACHE.set(trimmed, null);
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

  return resolveImageFromJsonUri(jsonUri);
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

import { createHmac, timingSafeEqual } from "node:crypto";
import { collectionConfigs, type CollectionConfig } from "@/content/site";
import { getCollectionConfig } from "@/lib/discord/config";
import { fetchAsset } from "@/lib/discord/helius";
import { getCollectionByMint } from "@/lib/nft-activity/config";
import {
  getOrbisWebhookSecret,
  type OrbisActivityEvent,
} from "@/lib/nft-activity/orbis-client";
import {
  mapOrbisEventType,
  processOrbisActivityEvent,
} from "@/lib/nft-activity/orbis-activity";

export type OrbisWebhookResult = {
  posted: number;
  skipped: number;
  duplicate: number;
  errors: string[];
};

type OrbisWebhookBody = {
  event?: string;
  timestamp?: number;
  data?: OrbisActivityEvent & {
    collectionId?: string | null;
    collectionAddress?: string | null;
    pathname?: string | null;
  };
};

async function resolveCollection(
  data: NonNullable<OrbisWebhookBody["data"]>,
): Promise<CollectionConfig | null> {
  const collectionAddress = data.collectionAddress?.trim();
  if (collectionAddress) {
    const byMint = getCollectionByMint(collectionAddress);
    if (byMint) return byMint;
  }

  const pathname = data.pathname?.trim();
  if (pathname) {
    const byPath = getCollectionConfig(pathname) ?? collectionConfigs.find((c) => c.id === pathname);
    if (byPath) return byPath;
  }

  const nftMint = data.mint?.trim();
  if (nftMint) {
    const asset = await fetchAsset(nftMint);
    const groupMint = asset?.grouping?.find((g) => g.group_key === "collection")?.group_value;
    if (groupMint) {
      return getCollectionByMint(groupMint) ?? null;
    }
  }

  return null;
}

export function verifyOrbisWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = getOrbisWebhookSecret();
  if (!secret) {
    // If no secret configured, accept unsigned webhooks (registration may omit secret).
    return true;
  }
  if (!signatureHeader?.trim()) {
    return false;
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signatureHeader.trim().replace(/^sha256=/i, "");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function processOrbisWebhookPayload(
  body: OrbisWebhookBody,
): Promise<OrbisWebhookResult> {
  const result: OrbisWebhookResult = {
    posted: 0,
    skipped: 0,
    duplicate: 0,
    errors: [],
  };

  const data = body.data;
  const eventTypeRaw = body.event ?? data?.type;
  if (!data || !mapOrbisEventType(eventTypeRaw)) {
    result.skipped += 1;
    return result;
  }

  const config = await resolveCollection(data);
  if (!config) {
    result.skipped += 1;
    return result;
  }

  const event: OrbisActivityEvent = {
    ...data,
    type: eventTypeRaw,
    timestamp: data.timestamp ?? body.timestamp ?? null,
  };

  try {
    const outcome = await processOrbisActivityEvent(config, event);
    if (outcome === "posted") result.posted += 1;
    else if (outcome === "duplicate") result.duplicate += 1;
    else result.skipped += 1;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

import { getCollectionConfig } from "@/lib/discord/config";
import { lookupNftByNumber } from "@/lib/discord/collection-index";
import { fetchAsset } from "@/lib/discord/helius";
import { buildActivityEmbed, type NftActivityEventType } from "@/lib/discord/nft-embed";
import { markActivityProcessed } from "@/lib/nft-activity/dedup";
import { postActivityEmbed } from "@/lib/nft-activity/discord-poster";
import {
  getBuxdaoCollectionSlugs,
  getGravemarketClient,
  type GravemarketActivityEvent,
} from "@/lib/nft-activity/gravemarket-client";
import {
  getLastGravemarketEventTime,
  setLastGravemarketEventTime,
} from "@/lib/nft-activity/gravemarket-sync-state";
import type { CollectionConfig } from "@/content/site";

const SYNC_EVENT_TYPES = new Set(["sale", "list", "listing", "delist", "transfer", "burn"]);
const OVERLAP_MS = 5 * 60 * 1000;
const PAGE_LIMIT = 30;

const EVENT_TYPE_MAP: Record<string, NftActivityEventType> = {
  sale: "sale",
  list: "list",
  listing: "list",
  delist: "delist",
  transfer: "transfer",
  burn: "burn",
};

export type GravemarketActivitySyncResult = {
  collectionsPolled: number;
  eventsFetched: number;
  eventsMatched: number;
  posted: number;
  skipped: number;
  errors: string[];
};

function parseTokenNumber(name: string | null | undefined): number | null {
  if (!name) {
    return null;
  }
  const match = name.match(/#\s*(\d+)\s*$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function mapEventType(raw: string | undefined): NftActivityEventType | null {
  if (!raw) {
    return null;
  }
  const normalized = raw.toLowerCase();
  if (!SYNC_EVENT_TYPES.has(normalized)) {
    return null;
  }
  return EVENT_TYPE_MAP[normalized] ?? null;
}

function normalizeSignature(txHash: string): string {
  return txHash.trim();
}

function priceToLamports(price: number | null | undefined, currency: string | null | undefined): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  const unit = (currency ?? "SOL").toUpperCase();
  if (unit !== "SOL") {
    return null;
  }
  return Math.round(price * 1e9);
}

async function resolveMintForEvent(
  config: CollectionConfig,
  event: GravemarketActivityEvent,
): Promise<{ mint: string; name: string; image: string | null } | null> {
  const itemName = event.market_items?.name?.trim() || null;
  const image =
    event.market_items?.thumbnail_url?.trim() ||
    event.market_items?.image_url?.trim() ||
    null;

  const tokenNumber = parseTokenNumber(itemName);
  if (tokenNumber != null) {
    const indexed = await lookupNftByNumber(config.id, tokenNumber);
    if (indexed) {
      return {
        mint: indexed.mint,
        name: itemName || indexed.name,
        image: image || indexed.image,
      };
    }
  }

  return null;
}

function solscanSignature(txHash: string): string {
  const trimmed = txHash.trim();
  const direct = trimmed.match(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  if (direct) {
    return trimmed;
  }
  const external = trimmed.match(/^ext:magiceden:([1-9A-HJ-NP-Za-km-z]{80,90}):/);
  if (external) {
    return external[1];
  }
  return trimmed;
}

async function processGravemarketEvent(
  config: CollectionConfig,
  event: GravemarketActivityEvent,
): Promise<"posted" | "skipped" | "duplicate"> {
  if (event.marketplace?.toLowerCase() !== "gravemarket") {
    return "skipped";
  }

  const eventType = mapEventType(event.event_type);
  const signature = event.tx_hash ? normalizeSignature(event.tx_hash) : "";
  if (!eventType || !signature) {
    return "skipped";
  }

  const resolved = await resolveMintForEvent(config, event);
  if (!resolved) {
    return "skipped";
  }

  const isNew = await markActivityProcessed({
    signature,
    mint: resolved.mint,
    eventType,
  });
  if (!isNew) {
    return "duplicate";
  }

  let name = resolved.name;
  let image = resolved.image;
  let owner: string | null = event.to_address ?? null;

  const live = await fetchAsset(resolved.mint);
  name = live?.content?.metadata?.name?.trim() || name;
  image = live?.content?.links?.image ?? image;
  owner = owner ?? live?.ownership?.owner ?? null;

  const embed = await buildActivityEmbed(config, {
    mint: resolved.mint,
    name,
    image,
    owner,
    eventType,
    priceLamports: priceToLamports(event.price, event.currency),
    seller: eventType === "sale" || eventType === "list" || eventType === "delist" ? event.from_address ?? null : null,
    buyer: eventType === "sale" ? event.to_address ?? null : null,
    from: eventType === "transfer" ? event.from_address ?? null : null,
    to: eventType === "transfer" ? event.to_address ?? null : null,
    marketplace: "GRAVE_MARKET",
    signature: solscanSignature(signature),
  });

  await postActivityEmbed(embed);
  return "posted";
}

export async function syncGravemarketActivity(): Promise<GravemarketActivitySyncResult> {
  const client = getGravemarketClient();
  const result: GravemarketActivitySyncResult = {
    collectionsPolled: 0,
    eventsFetched: 0,
    eventsMatched: 0,
    posted: 0,
    skipped: 0,
    errors: [],
  };

  if (!client) {
    throw new Error("GRAVEMARKET_API_KEY is not configured");
  }

  for (const slug of getBuxdaoCollectionSlugs()) {
    const config = getCollectionConfig(slug);
    if (!config) {
      continue;
    }

    result.collectionsPolled += 1;

    try {
      const since = new Date((await getLastGravemarketEventTime(slug)).getTime() - OVERLAP_MS);
      let maxEventTime = since;

      const page = await client.collections.activity(slug, {
        limit: PAGE_LIMIT,
        marketplace: "gravemarket",
      });

      const events = (page as { data?: GravemarketActivityEvent[] }).data ?? [];
      result.eventsFetched += events.length;

      const ordered = [...events].sort(
        (a, b) => new Date(a.event_time ?? 0).getTime() - new Date(b.event_time ?? 0).getTime(),
      );

      for (const event of ordered) {
        const eventTime = event.event_time ? new Date(event.event_time) : null;
        if (eventTime && eventTime > maxEventTime) {
          maxEventTime = eventTime;
        }

        if (eventTime && eventTime <= since) {
          result.skipped += 1;
          continue;
        }

        if (event.marketplace?.toLowerCase() !== "gravemarket") {
          result.skipped += 1;
          continue;
        }

        if (!mapEventType(event.event_type)) {
          result.skipped += 1;
          continue;
        }

        result.eventsMatched += 1;

        try {
          const outcome = await processGravemarketEvent(config, event);
          if (outcome === "posted") {
            result.posted += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(
            `${slug}:${event.tx_hash ?? "?"}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (events.length > 0) {
        await setLastGravemarketEventTime(slug, maxEventTime);
      }
    } catch (error) {
      result.errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

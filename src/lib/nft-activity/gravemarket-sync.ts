import { getCollectionConfig } from "@/lib/discord/config";
import { lookupNftByNumber } from "@/lib/discord/collection-index";
import { fetchAsset, resolveAssetImage } from "@/lib/discord/helius";
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

function gravemarketItemEventToActivityEvent(
  mint: string,
  event: Record<string, unknown>,
): GravemarketActivityEvent | null {
  const eventType = typeof event.event_type === "string" ? event.event_type : undefined;
  const txHash = typeof event.tx_hash === "string" ? event.tx_hash : undefined;
  const eventTime = typeof event.event_time === "string" ? event.event_time : undefined;
  if (!eventType || !txHash || !eventTime) {
    return null;
  }

  const itemName = typeof event.item_name === "string" ? event.item_name : null;
  const imageUrl = typeof event.image_url === "string" ? event.image_url : null;

  return {
    event_type: eventType,
    tx_hash: txHash,
    event_time: eventTime,
    marketplace: typeof event.marketplace === "string" ? event.marketplace : "gravemarket",
    from_address: typeof event.from_address === "string" ? event.from_address : null,
    to_address: typeof event.to_address === "string" ? event.to_address : null,
    price: typeof event.price === "number" ? event.price : null,
    currency: typeof event.currency === "string" ? event.currency : null,
    market_items: {
      name: itemName,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
    },
  };
}

async function fetchSupplementaryItemActivity(
  client: NonNullable<ReturnType<typeof getGravemarketClient>>,
  config: CollectionConfig,
  mint: string,
  since: Date,
): Promise<GravemarketActivityEvent[]> {
  try {
    const page = await client.items.activity(mint, { limit: 10 });
    const events: GravemarketActivityEvent[] = [];
    for (const raw of page.data ?? []) {
      const mapped = gravemarketItemEventToActivityEvent(mint, raw as Record<string, unknown>);
      if (!mapped?.event_time) {
        continue;
      }
      if (new Date(mapped.event_time) <= since) {
        continue;
      }
      if (mapped.marketplace?.toLowerCase() !== "gravemarket") {
        continue;
      }
      if (!mapEventType(mapped.event_type)) {
        continue;
      }
      events.push(mapped);
    }
    return events;
  } catch {
    return [];
  }
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
  if (tokenNumber == null) {
    return null;
  }

  const client = getGravemarketClient();
  if (client) {
    try {
      const page = await client.collections.items(config.id, {
        search: `#${tokenNumber}`,
        limit: 10,
      });
      const match = (page.data ?? []).find(
        (item) => parseTokenNumber(item.name ?? "") === tokenNumber && item.token_address,
      );
      if (match?.token_address) {
        return {
          mint: match.token_address,
          name: itemName || match.name || `${config.name} #${tokenNumber}`,
          image: image || match.thumbnail_url || match.image_url || null,
        };
      }
    } catch {
      // fall through to on-chain index
    }
  }

  const indexed = await lookupNftByNumber(config.id, tokenNumber);
  if (indexed) {
    return {
      mint: indexed.mint,
      name: itemName || indexed.name,
      image: image || indexed.image,
    };
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
  image = (await resolveAssetImage(live)) ?? image;
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
      let maxProcessedEventTime = since;

      const page = await client.collections.activity(slug, {
        limit: PAGE_LIMIT,
      });

      const events = (page as { data?: GravemarketActivityEvent[] }).data ?? [];
      result.eventsFetched += events.length;

      const ordered = [...events].sort(
        (a, b) => new Date(a.event_time ?? 0).getTime() - new Date(b.event_time ?? 0).getTime(),
      );

      for (const event of ordered) {
        const eventTime = event.event_time ? new Date(event.event_time) : null;

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
            if (eventTime && eventTime > maxProcessedEventTime) {
              maxProcessedEventTime = eventTime;
            }
          } else if (outcome === "duplicate") {
            result.skipped += 1;
            if (eventTime && eventTime > maxProcessedEventTime) {
              maxProcessedEventTime = eventTime;
            }
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(
            `${slug}:${event.tx_hash ?? "?"}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Collection activity omits some GraveMarket delists; item activity has them.
      const mintsToCheck = new Set<string>();
      for (const event of ordered) {
        const eventTime = event.event_time ? new Date(event.event_time) : null;
        if (!eventTime || eventTime <= since) {
          continue;
        }
        if (event.marketplace?.toLowerCase() !== "gravemarket") {
          continue;
        }
        const resolved = await resolveMintForEvent(config, event);
        if (resolved?.mint) {
          mintsToCheck.add(resolved.mint);
        }
      }

      const seenTx = new Set(
        ordered.map((event) => (event.tx_hash ? normalizeSignature(event.tx_hash) : "")).filter(Boolean),
      );

      for (const mint of mintsToCheck) {
        const supplementary = await fetchSupplementaryItemActivity(client, config, mint, since);
        for (const event of supplementary) {
          const txHash = event.tx_hash ? normalizeSignature(event.tx_hash) : "";
          if (!txHash || seenTx.has(txHash)) {
            continue;
          }
          seenTx.add(txHash);

          result.eventsMatched += 1;
          try {
            const outcome = await processGravemarketEvent(config, event);
            if (outcome === "posted") {
              result.posted += 1;
              const eventTime = event.event_time ? new Date(event.event_time) : null;
              if (eventTime && eventTime > maxProcessedEventTime) {
                maxProcessedEventTime = eventTime;
              }
            } else if (outcome === "duplicate") {
              result.skipped += 1;
              const eventTime = event.event_time ? new Date(event.event_time) : null;
              if (eventTime && eventTime > maxProcessedEventTime) {
                maxProcessedEventTime = eventTime;
              }
            } else {
              result.skipped += 1;
            }
          } catch (error) {
            result.errors.push(
              `${slug}:${event.tx_hash ?? "?"}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }

      if (maxProcessedEventTime > since) {
        await setLastGravemarketEventTime(slug, maxProcessedEventTime);
      }
    } catch (error) {
      result.errors.push(`${slug}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

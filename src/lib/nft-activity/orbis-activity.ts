import { fetchAsset, resolveAssetImage } from "@/lib/discord/helius";
import { buildActivityEmbed, type NftActivityEventType } from "@/lib/discord/nft-embed";
import { markActivityProcessed } from "@/lib/nft-activity/dedup";
import { postActivityEmbed } from "@/lib/nft-activity/discord-poster";
import type { OrbisActivityEvent } from "@/lib/nft-activity/orbis-client";
import type { CollectionConfig } from "@/content/site";

const EVENT_TYPE_MAP: Record<string, NftActivityEventType> = {
  sale: "sale",
  offer_accepted: "sale",
  listing: "list",
  delist: "delist",
};

export function mapOrbisEventType(raw: string | undefined): NftActivityEventType | null {
  if (!raw) return null;
  return EVENT_TYPE_MAP[raw.toLowerCase()] ?? null;
}

export function mapOrbisMarketplaceSource(source: string | null | undefined): string {
  const normalized = (source ?? "gotm").trim().toLowerCase();
  if (normalized === "gotm" || normalized === "orbis") return "ORBIS";
  if (normalized === "magiceden" || normalized === "magic_eden" || normalized === "me") {
    return "MAGIC_EDEN";
  }
  if (normalized === "tensor" || normalized === "tensor_swap") return "TENSOR";
  if (normalized === "gravemarket" || normalized === "grave_market") return "GRAVE_MARKET";
  return normalized.toUpperCase().replace(/[-\s]+/g, "_");
}

function priceToLamports(priceSol: number | null | undefined): number | null {
  if (priceSol == null || !Number.isFinite(priceSol) || priceSol <= 0) {
    return null;
  }
  return Math.round(priceSol * 1e9);
}

function activitySignature(event: OrbisActivityEvent): string | null {
  const tx = event.txSignature?.trim();
  if (tx) return tx;
  const id = event.id?.trim();
  if (id) return `orbis:${id}`;
  return null;
}

function eventTimestamp(event: OrbisActivityEvent): Date | null {
  if (typeof event.timestamp === "number" && Number.isFinite(event.timestamp)) {
    return new Date(event.timestamp);
  }
  return null;
}

export function partiesForOrbisEvent(
  eventType: NftActivityEventType,
  event: OrbisActivityEvent,
): { seller: string | null; buyer: string | null; owner: string | null } {
  const wallet = event.wallet?.trim() || null;
  const counterparty = event.counterparty?.trim() || null;

  if (eventType === "sale") {
    // Docs: wallet = buyer, counterparty = seller
    return {
      buyer: wallet,
      seller: counterparty,
      owner: wallet,
    };
  }

  // listing / delist: wallet = seller
  return {
    seller: wallet,
    buyer: null,
    owner: wallet,
  };
}

export async function processOrbisActivityEvent(
  config: CollectionConfig,
  event: OrbisActivityEvent,
): Promise<"posted" | "skipped" | "duplicate"> {
  const eventType = mapOrbisEventType(event.type);
  const mint = event.mint?.trim();
  const signature = activitySignature(event);
  if (!eventType || !mint || !signature) {
    return "skipped";
  }

  const isNew = await markActivityProcessed({
    signature,
    mint,
    eventType,
  });
  if (!isNew) {
    return "duplicate";
  }

  let name = event.name?.trim() || `${config.name} NFT`;
  let image = event.image?.trim() || null;
  const parties = partiesForOrbisEvent(eventType, event);
  let owner = parties.owner;

  const live = await fetchAsset(mint);
  name = live?.content?.metadata?.name?.trim() || name;
  image = (await resolveAssetImage(live)) ?? image;
  owner = owner ?? live?.ownership?.owner ?? null;

  const embed = await buildActivityEmbed(config, {
    mint,
    name,
    image,
    owner,
    eventType,
    priceLamports: priceToLamports(event.priceSol),
    seller: parties.seller,
    buyer: parties.buyer,
    marketplace: mapOrbisMarketplaceSource(event.source),
    signature,
  });

  await postActivityEmbed(embed);
  return "posted";
}

export function orbisEventTime(event: OrbisActivityEvent): Date | null {
  return eventTimestamp(event);
}

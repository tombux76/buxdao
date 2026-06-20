import { fetchAsset, resolveAssetImage } from "@/lib/discord/helius";
import { buildActivityEmbed, type NftActivityEventType } from "@/lib/discord/nft-embed";
import { getCollectionByMint, isMarketplaceSource, isWalletToWalletTransfer } from "@/lib/nft-activity/config";
import { markActivityProcessed } from "@/lib/nft-activity/dedup";
import { postActivityEmbed } from "@/lib/nft-activity/discord-poster";
import type { CollectionConfig } from "@/content/site";

type HeliusNftRef = { mint?: string; tokenStandard?: string };
type HeliusNftEvent = {
  type?: string;
  source?: string;
  amount?: number;
  seller?: string;
  buyer?: string;
  nfts?: HeliusNftRef[];
  signature?: string;
};
type HeliusTokenTransfer = {
  mint?: string;
  fromUserAccount?: string;
  toUserAccount?: string;
  tokenStandard?: string;
};
export type HeliusEnhancedTx = {
  signature?: string;
  type?: string;
  source?: string;
  description?: string;
  events?: { nft?: HeliusNftEvent };
  tokenTransfers?: HeliusTokenTransfer[];
};

export type ParsedActivityEvent = {
  signature: string;
  mint: string;
  eventType: NftActivityEventType;
  priceLamports?: number | null;
  seller?: string | null;
  buyer?: string | null;
  from?: string | null;
  to?: string | null;
  marketplace?: string | null;
  owner?: string | null;
};

const HELIUS_TYPE_MAP: Record<string, NftActivityEventType> = {
  NFT_SALE: "sale",
  NFT_LISTING: "list",
  NFT_CANCEL_LISTING: "delist",
  TRANSFER: "transfer",
  BURN_NFT: "burn",
};

function extractNftMints(tx: HeliusEnhancedTx): string[] {
  const mints = new Set<string>();
  for (const nft of tx.events?.nft?.nfts ?? []) {
    if (nft.mint) {
      mints.add(nft.mint);
    }
  }
  for (const transfer of tx.tokenTransfers ?? []) {
    if (transfer.mint && transfer.tokenStandard === "NonFungible") {
      mints.add(transfer.mint);
    }
  }
  return [...mints];
}

function mapHeliusType(type: string | undefined): NftActivityEventType | null {
  if (!type) {
    return null;
  }
  return HELIUS_TYPE_MAP[type.toUpperCase()] ?? null;
}

function parseFromNftEvent(tx: HeliusEnhancedTx, eventType: NftActivityEventType): ParsedActivityEvent[] {
  const signature = tx.signature ?? tx.events?.nft?.signature;
  const nftEvent = tx.events?.nft;
  if (!signature || !nftEvent) {
    return [];
  }

  const mints = extractNftMints(tx);
  if (mints.length === 0) {
    return [];
  }

  const marketplace = nftEvent.source ?? tx.source ?? null;

  return mints.map((mint) => {
    const base: ParsedActivityEvent = {
      signature,
      mint,
      eventType,
      marketplace,
      priceLamports: nftEvent.amount ?? null,
      seller: nftEvent.seller ?? null,
      buyer: nftEvent.buyer ?? null,
    };

    if (eventType === "burn") {
      base.owner = nftEvent.seller ?? tx.events?.nft?.buyer ?? null;
    }

    return base;
  });
}

function parseTransfer(tx: HeliusEnhancedTx): ParsedActivityEvent[] {
  const signature = tx.signature;
  if (!signature) {
    return [];
  }

  if (isMarketplaceSource(tx.source) || isMarketplaceSource(tx.events?.nft?.source)) {
    return [];
  }

  const results: ParsedActivityEvent[] = [];
  for (const transfer of tx.tokenTransfers ?? []) {
    if (transfer.tokenStandard !== "NonFungible" || !transfer.mint) {
      continue;
    }
    const from = transfer.fromUserAccount ?? null;
    const to = transfer.toUserAccount ?? null;
    if (!isWalletToWalletTransfer(from, to)) {
      continue;
    }
    results.push({
      signature,
      mint: transfer.mint,
      eventType: "transfer",
      from,
      to,
      marketplace: null,
    });
  }

  return results;
}

export function parseHeliusActivityEvents(tx: HeliusEnhancedTx): ParsedActivityEvent[] {
  const heliusType = tx.type?.toUpperCase();
  const eventType = mapHeliusType(heliusType);

  if (heliusType === "TRANSFER") {
    return parseTransfer(tx);
  }

  if (!eventType) {
    return [];
  }

  if (tx.events?.nft) {
    return parseFromNftEvent(tx, eventType);
  }

  if (eventType === "transfer") {
    return parseTransfer(tx);
  }

  return [];
}

async function resolveCollectionForMint(mint: string): Promise<CollectionConfig | null> {
  const asset = await fetchAsset(mint);
  const collectionMint = asset?.grouping?.find((g) => g.group_key === "collection")?.group_value;
  if (!collectionMint) {
    return null;
  }
  return getCollectionByMint(collectionMint) ?? null;
}

export type ProcessWebhookResult = {
  received: number;
  parsed: number;
  posted: number;
  skipped: number;
  errors: string[];
};

export async function processHeliusActivityPayload(payload: unknown): Promise<ProcessWebhookResult> {
  const txs = Array.isArray(payload) ? payload : [payload];
  const result: ProcessWebhookResult = {
    received: txs.length,
    parsed: 0,
    posted: 0,
    skipped: 0,
    errors: [],
  };

  for (const raw of txs) {
    if (!raw || typeof raw !== "object") {
      result.skipped += 1;
      continue;
    }

    const tx = raw as HeliusEnhancedTx;
    const events = parseHeliusActivityEvents(tx);
    result.parsed += events.length;

    for (const event of events) {
      try {
        const config = await resolveCollectionForMint(event.mint);
        if (!config) {
          result.skipped += 1;
          continue;
        }

        const isNew = await markActivityProcessed({
          signature: event.signature,
          mint: event.mint,
          eventType: event.eventType,
        });
        if (!isNew) {
          result.skipped += 1;
          continue;
        }

        const asset = await fetchAsset(event.mint);
        const name = asset?.content?.metadata?.name?.trim() || `${config.name} NFT`;
        const image = await resolveAssetImage(asset);
        const owner =
          event.eventType === "transfer"
            ? event.to ?? null
            : event.buyer ?? event.to ?? asset?.ownership?.owner ?? null;

        const embed = await buildActivityEmbed(config, {
          mint: event.mint,
          name,
          image,
          owner,
          eventType: event.eventType,
          priceLamports: event.priceLamports,
          seller: event.seller,
          buyer: event.buyer,
          from: event.from,
          to: event.to,
          marketplace: event.marketplace,
          signature: event.signature,
        });

        await postActivityEmbed(embed);
        result.posted += 1;
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  }

  return result;
}

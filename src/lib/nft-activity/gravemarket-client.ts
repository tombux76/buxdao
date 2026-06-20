import { GravemarketClient } from "@solanadeads/gravemarket";
import { collectionConfigs } from "@/content/site";

let client: GravemarketClient | null = null;

export function getGravemarketClient(): GravemarketClient | null {
  const apiKey = process.env.GRAVEMARKET_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  if (!client) {
    client = new GravemarketClient({ apiKey });
  }

  return client;
}

export function getBuxdaoCollectionSlugs(): string[] {
  return collectionConfigs.map((c) => c.id);
}

export type GravemarketActivityEvent = {
  chain?: string;
  event_type?: string;
  from_address?: string | null;
  to_address?: string | null;
  price?: number | null;
  currency?: string | null;
  tx_hash?: string | null;
  event_time?: string;
  marketplace?: string | null;
  market_collections?: { slug?: string | null; name?: string | null } | null;
  market_items?: {
    name?: string | null;
    image_url?: string | null;
    thumbnail_url?: string | null;
  } | null;
};

export type GravemarketActivityPage = {
  data?: GravemarketActivityEvent[];
  cursor?: string | null;
  hasMore?: boolean;
};

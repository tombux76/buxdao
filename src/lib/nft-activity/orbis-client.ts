import { collectionConfigs } from "@/content/site";

const ORBIS_MP_PUBLIC_API = "https://www.orbisonsol.io/api/mp-public";

export type OrbisActivitySource = "gotm" | "magiceden" | "tensor" | string;

export type OrbisActivityType =
  | "sale"
  | "offer_accepted"
  | "listing"
  | "delist"
  | "offer_made"
  | "offer_cancelled"
  | "price_update"
  | string;

export type OrbisActivityEvent = {
  id?: string;
  type?: OrbisActivityType;
  mint?: string;
  name?: string | null;
  image?: string | null;
  priceSol?: number | null;
  wallet?: string | null;
  counterparty?: string | null;
  txSignature?: string | null;
  source?: OrbisActivitySource | null;
  timestamp?: number | null;
  collectionId?: string | null;
};

type OrbisApiResponse<T> = {
  success?: boolean;
  data?: T;
  error?: string;
  meta?: { timestamp?: number; source?: string; count?: number };
};

export function getOrbisApiKey(): string | null {
  const key = process.env.ORBIS_API_KEY?.trim();
  return key || null;
}

export function getOrbisWebhookSecret(): string | null {
  const secret = process.env.ORBIS_WEBHOOK_SECRET?.trim();
  return secret || null;
}

export function getBuxdaoOrbisCollections(): Array<{
  id: string;
  collectionMint: string;
  pathname: string;
}> {
  return collectionConfigs.map((c) => ({
    id: c.id,
    collectionMint: c.collectionMint,
    pathname: c.id,
  }));
}

async function orbisGet<T>(
  action: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const apiKey = getOrbisApiKey();
  if (!apiKey) {
    throw new Error("ORBIS_API_KEY is not configured");
  }

  const url = new URL(ORBIS_MP_PUBLIC_API);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "BUXDAO/2.0 (+https://www.buxdao.com)",
      "X-API-Key": apiKey,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const payload = (await response.json().catch(() => null)) as OrbisApiResponse<T> | null;
  if (!response.ok || !payload?.success) {
    const message = payload?.error || `Orbis ${action} failed (${response.status})`;
    throw new Error(message);
  }

  return payload.data as T;
}

export async function fetchOrbisCollectionActivity(params: {
  collectionAddress: string;
  type?: string;
  limit?: number;
}): Promise<OrbisActivityEvent[]> {
  const data = await orbisGet<OrbisActivityEvent[]>("activity", {
    collectionAddress: params.collectionAddress,
    type: params.type,
    limit: params.limit ?? 50,
  });
  return Array.isArray(data) ? data : [];
}

export async function registerOrbisWebhook(params: {
  url: string;
  events?: string[];
  collections?: string[];
  secret?: string;
}): Promise<unknown> {
  const apiKey = getOrbisApiKey();
  if (!apiKey) {
    throw new Error("ORBIS_API_KEY is not configured");
  }

  const response = await fetch(`${ORBIS_MP_PUBLIC_API}?action=registerWebhook`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "BUXDAO/2.0 (+https://www.buxdao.com)",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      url: params.url,
      events: params.events,
      collections: params.collections,
      secret: params.secret,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });

  const payload = (await response.json().catch(() => null)) as OrbisApiResponse<unknown> | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Orbis registerWebhook failed (${response.status})`);
  }
  return payload.data;
}

export async function listOrbisWebhooks(): Promise<unknown> {
  return orbisGet<unknown>("getWebhooks", {});
}

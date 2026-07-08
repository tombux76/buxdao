import { PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
import { fetchAsset, resolveAssetImage } from "@/lib/discord/helius";
import { EMPIRE_TOKEN_MINT, PRIZE_EMPIRE_AMOUNT } from "@/lib/prize-draw/config";
import { withServerConnection } from "@/lib/solana/server-rpc";

const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;
const META_CACHE_TTL_MS = 60 * 60 * 1000;

let cachedPriceUsd: number | null = null;
let cachedPriceAt = 0;
let cachedImage: string | null | undefined;
let cachedImageAt = 0;
let cachedDecimals: number | null = null;
let cachedDecimalsAt = 0;

export async function getEmpireDecimals(): Promise<number> {
  if (cachedDecimals != null && Date.now() - cachedDecimalsAt < META_CACHE_TTL_MS) {
    return cachedDecimals;
  }

  const decimals = await withServerConnection(async (connection) => {
    const mint = await getMint(connection, new PublicKey(EMPIRE_TOKEN_MINT));
    return mint.decimals;
  });

  cachedDecimals = decimals;
  cachedDecimalsAt = Date.now();
  return decimals;
}

export function empireToRaw(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * 10 ** decimals));
}

export async function fetchEmpireTokenImage(): Promise<string | null> {
  if (cachedImage !== undefined && Date.now() - cachedImageAt < META_CACHE_TTL_MS) {
    return cachedImage;
  }

  try {
    const asset = await fetchAsset(EMPIRE_TOKEN_MINT);
    const image = await resolveAssetImage(asset);
    cachedImage = image;
    cachedImageAt = Date.now();
    return image;
  } catch {
    cachedImage = null;
    cachedImageAt = Date.now();
    return null;
  }
}

/** Live USD price via DexScreener (best-effort). */
export async function fetchEmpireUsdPrice(): Promise<number | null> {
  if (cachedPriceUsd != null && Date.now() - cachedPriceAt < PRICE_CACHE_TTL_MS) {
    return cachedPriceUsd;
  }

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(EMPIRE_TOKEN_MINT)}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      return cachedPriceUsd;
    }

    const body = (await response.json()) as {
      pairs?: { priceUsd?: string; liquidity?: { usd?: number } }[];
    };

    const pairs = (body.pairs ?? []).filter((pair) => pair.priceUsd);
    if (pairs.length === 0) {
      return cachedPriceUsd;
    }

    pairs.sort(
      (a, b) => (Number(b.liquidity?.usd ?? 0) || 0) - (Number(a.liquidity?.usd ?? 0) || 0),
    );

    const price = Number.parseFloat(pairs[0]?.priceUsd ?? "");
    if (!Number.isFinite(price) || price <= 0) {
      return cachedPriceUsd;
    }

    cachedPriceUsd = price;
    cachedPriceAt = Date.now();
    return price;
  } catch {
    return cachedPriceUsd;
  }
}

export async function getPrizeUsdValue(): Promise<number | null> {
  const price = await fetchEmpireUsdPrice();
  if (price == null) {
    return null;
  }
  return PRIZE_EMPIRE_AMOUNT * price;
}

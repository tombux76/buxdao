import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listLinkedWalletAddresses } from "@/lib/holder-rewards/wallet-auth";
import { fetchHubWalletHoldings, type HubNft } from "@/lib/hub/wallet-nfts";
import { fetchTokenMetrics } from "@/lib/bux/metrics";
import { hasHeliusApiKey } from "@/lib/helius-rpc";
import { collectionConfigs } from "@/content/site";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type HoldingsPayload = {
  buxBalance: number;
  collections: Record<string, HubNft[]>;
  cashoutSol: number;
  cashoutUsd: number;
  tokenValue: number;
  walletCount: number;
};

// Short-lived per-user cache so repeat loads (navigation, tab switches,
// mobile refreshes) are instant instead of re-hitting Helius for every
// linked wallet. Keyed by userId + the set of linked wallets.
const CACHE_TTL_MS = 60_000;
const holdingsCache = new Map<string, { key: string; expires: number; payload: HoldingsPayload }>();

/**
 * Aggregated holdings across ALL linked wallets for the logged-in user.
 * Discord login + at least one linked wallet is enough — no live wallet
 * connection required (that's only needed to sign wallet actions).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!hasHeliusApiKey()) {
    return NextResponse.json({ error: "Helius not configured" }, { status: 503 });
  }

  const userId = session.user.id;
  const wallets = await listLinkedWalletAddresses(userId);
  if (wallets.length === 0) {
    return NextResponse.json({
      buxBalance: 0,
      collections: Object.fromEntries(collectionConfigs.map((c) => [c.id, [] as HubNft[]])),
      cashoutSol: 0,
      cashoutUsd: 0,
      tokenValue: 0,
      walletCount: 0,
    } satisfies HoldingsPayload);
  }

  const cacheKey = [...wallets].sort().join(",");
  const cached = holdingsCache.get(userId);
  if (cached && cached.key === cacheKey && cached.expires > Date.now()) {
    return NextResponse.json(cached.payload);
  }

  try {
    const [perWallet, metrics] = await Promise.all([
      Promise.all(wallets.map((wallet) => fetchHubWalletHoldings(wallet))),
      fetchTokenMetrics(),
    ]);

    const collections: Record<string, HubNft[]> = Object.fromEntries(
      collectionConfigs.map((c) => [c.id, [] as HubNft[]]),
    );
    const seenMints = new Set<string>();
    let buxBalance = 0;

    for (const holdings of perWallet) {
      buxBalance += holdings.buxBalance;
      for (const config of collectionConfigs) {
        for (const nft of holdings.collections[config.id] ?? []) {
          if (seenMints.has(nft.mint)) {
            continue;
          }
          seenMints.add(nft.mint);
          collections[config.id].push(nft);
        }
      }
    }

    const tokenValue = metrics?.tokenValue ?? 0;
    const solPrice = metrics?.solPrice ?? 0;
    const cashoutSol = buxBalance * tokenValue;
    const cashoutUsd = cashoutSol * solPrice;

    const payload: HoldingsPayload = {
      buxBalance,
      collections,
      cashoutSol,
      cashoutUsd,
      tokenValue,
      walletCount: wallets.length,
    };

    const nftCount = Object.values(collections).reduce((sum, list) => sum + list.length, 0);
    // Don't cache empty NFT results — Helius soft-fails must not stick for a minute.
    if (nftCount > 0 || buxBalance > 0) {
      holdingsCache.set(userId, { key: cacheKey, expires: Date.now() + CACHE_TTL_MS, payload });
    }

    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: "Failed to fetch holdings" }, { status: 500 });
  }
}

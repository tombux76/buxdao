"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Coins, TrendingUp } from "lucide-react";
import { DiscordRolesDisplay } from "@/components/hub/DiscordRolesDisplay";
import { HubCashoutSection } from "@/components/hub/HubCashoutSection";
import { Card } from "@/components/ui/Card";
import { useHubRoles } from "@/hooks/useHubRoles";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";
import { collectionConfigs } from "@/content/site";
import type { HubNft } from "@/lib/hub/wallet-nfts";

type HubHoldingsResponse = {
  buxBalance: number;
  cashoutSol: number;
  cashoutUsd: number;
  collections: Record<string, HubNft[]>;
  walletCount: number;
};

const COLLAPSED_ROW_COUNT = 4;

function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(4);
  }
  return value.toFixed(2);
}

function NftGrid({ nfts }: { nfts: HubNft[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = nfts.length > COLLAPSED_ROW_COUNT;
  const visible = expanded ? nfts : nfts.slice(0, COLLAPSED_ROW_COUNT);

  if (nfts.length === 0) {
    return <p className="py-8 text-center text-sm text-muted">No NFTs from this collection in your wallet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map((nft) => (
          <div
            key={nft.mint}
            className="overflow-hidden rounded-xl border border-border/70 bg-bg-surface/30"
          >
            <div className="relative aspect-square bg-bg-surface">
              {nft.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={nft.image} alt="" className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-muted">No image</div>
              )}
              {nft.staked && (
                <span className="absolute left-2 top-2 rounded-md bg-accent-purple/90 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  Staked
                </span>
              )}
            </div>
            <div className="p-2.5">
              <p className="truncate text-sm font-medium">{nft.name}</p>
              {nft.number != null && (
                <p className="text-xs text-muted">#{nft.number}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full rounded-xl border border-border py-2 text-sm text-muted transition hover:border-border-strong hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${nfts.length} NFTs`}
        </button>
      )}
    </div>
  );
}

export function HubDashboard() {
  const { data: session, status: authStatus } = useSession();
  const { wallets } = useLinkedWallets();
  const { roles, loading: rolesLoading, error: rolesError } = useHubRoles();
  const [activeTab, setActiveTab] = useState(collectionConfigs[0].id);
  const [data, setData] = useState<HubHoldingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const discordReady = authStatus === "authenticated" && !!session?.user;
  const hasLinkedWallet = wallets.length > 0;
  const ready = discordReady && hasLinkedWallet;

  useEffect(() => {
    if (!ready) {
      setData(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/hub/holdings`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to load holdings");
        }
        return res.json() as Promise<HubHoldingsResponse>;
      })
      .then(setData)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
    // Re-fetch when the set of linked wallets changes.
  }, [ready, wallets.length]);

  const activeCollection = collectionConfigs.find((c) => c.id === activeTab) ?? collectionConfigs[0];
  const activeNfts = data?.collections[activeTab] ?? [];
  const totalNfts = data
    ? Object.values(data.collections).reduce((sum, list) => sum + list.length, 0)
    : 0;

  function renderHoldingsPanel() {
    if (!discordReady) {
      return (
        <p className="py-8 text-center text-sm text-muted">
          Log in with Discord to view your NFT holdings and balances.
        </p>
      );
    }
    if (!hasLinkedWallet) {
      return (
        <p className="py-8 text-center text-sm text-muted">
          Link a wallet to view your NFTs and $BUX balance. Once linked, your holdings show here
          automatically — no need to reconnect.
        </p>
      );
    }
    if (loading) {
      return <p className="py-8 text-center text-sm text-muted">Loading your holdings…</p>;
    }
    if (error) {
      return <p className="py-8 text-center text-sm text-red-400">{error}</p>;
    }
    return <NftGrid nfts={activeNfts} />;
  }

  return (
    <div className="space-y-5">
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {collectionConfigs.map((collection) => {
            const count = data?.collections[collection.id]?.length ?? 0;
            const isActive = collection.id === activeTab;
            return (
              <button
                key={collection.id}
                type="button"
                onClick={() => setActiveTab(collection.id)}
                className={`shrink-0 rounded-t-lg px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "border border-b-0 border-border bg-bg-deep text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {collection.name}
                {count > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                      isActive ? "bg-accent-purple/20 text-accent-purple" : "bg-bg-surface text-muted"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-border border-t-0 bg-bg-deep/30 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={activeCollection.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
          <div>
            <h4 className="font-semibold">{activeCollection.name}</h4>
            <p className="text-xs text-muted">
              {ready && data
                ? `${activeNfts.length} NFT${activeNfts.length === 1 ? "" : "s"}${
                    totalNfts > 0 ? ` · ${totalNfts} total across collections` : ""
                  }`
                : "Your holdings appear here once Discord is connected and a wallet is linked."}
            </p>
          </div>
        </div>
        {renderHoldingsPanel()}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4 sm:col-span-2">
          <DiscordRolesDisplay roles={roles} loading={rolesLoading} error={rolesError} />
        </Card>
        <div className="rounded-xl border border-border/70 bg-bg-surface/30 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gold/15 text-accent-gold">
              <Coins className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">$BUX balance</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-accent-gold">
                {data ? formatBux(data.buxBalance) : "—"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-border/70 bg-bg-surface/30 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-cyan/15 text-accent-cyan">
              <TrendingUp className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted">Cashout value</p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-accent-gold">
                {data ? `${formatSol(data.cashoutSol)} SOL` : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <HubCashoutSection />
    </div>
  );
}

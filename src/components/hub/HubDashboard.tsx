"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { DiscordRolesDisplay } from "@/components/hub/DiscordRolesDisplay";
import { LegacyClaimCard } from "@/components/hub/LegacyClaimCard";
import { useHubRoles } from "@/hooks/useHubRoles";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";
import { collectionConfigs } from "@/content/site";
import type { HubNft } from "@/lib/hub/wallet-nfts";

type HubHoldingsResponse = {
  buxBalance: number;
  cashoutSol: number;
  cashoutUsd: number;
  collections: Record<string, HubNft[]>;
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
            className="tile-border overflow-hidden rounded-xl bg-bg-deep/50"
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
  const { publicKey, connected } = useWallet();
  const { wallets } = useLinkedWallets();
  const { roles, loading: rolesLoading, error: rolesError } = useHubRoles();
  const [activeTab, setActiveTab] = useState(collectionConfigs[0].id);
  const [data, setData] = useState<HubHoldingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const linkedAddresses = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);
  const discordReady = authStatus === "authenticated" && !!session?.user;
  const walletConnected = connected && !!publicKey;
  const walletLinked =
    walletConnected && publicKey ? linkedAddresses.has(publicKey.toBase58()) : false;
  const ready = discordReady && walletLinked;

  useEffect(() => {
    if (!ready || !publicKey) {
      setData(null);
      setError(null);
      return;
    }

    const wallet = publicKey.toBase58();
    setLoading(true);
    setError(null);

    fetch(`/api/hub/nfts?wallet=${encodeURIComponent(wallet)}`)
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
  }, [ready, publicKey]);

  if (!discordReady || !walletConnected) {
    return (
      <p className="text-sm text-muted">
        {!discordReady && !walletConnected
          ? "Log in with Discord and connect your wallet to view your dashboard."
          : !discordReady
            ? "Log in with Discord to unlock your dashboard."
            : "Connect your wallet to load your NFTs and $BUX balance."}
      </p>
    );
  }

  if (!walletLinked) {
    return (
      <p className="text-sm text-muted">
        Sign the message to link your wallet — use the &quot;Sign to link wallet&quot; button above.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted">Loading your holdings…</p>;
  }

  if (error) {
    return <p className="text-sm text-red-400">{error}</p>;
  }

  if (!data) {
    return null;
  }

  const activeCollection = collectionConfigs.find((c) => c.id === activeTab) ?? collectionConfigs[0];
  const activeNfts = data.collections[activeTab] ?? [];
  const totalNfts = Object.values(data.collections).reduce((sum, list) => sum + list.length, 0);

  return (
    <div className="space-y-5">
      <div className="border-b border-border">
        <div className="flex gap-1 overflow-x-auto pb-px">
          {collectionConfigs.map((collection) => {
            const count = data.collections[collection.id]?.length ?? 0;
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
              {activeNfts.length} NFT{activeNfts.length === 1 ? "" : "s"}
              {totalNfts > 0 ? ` · ${totalNfts} total across collections` : ""}
            </p>
          </div>
        </div>
        <NftGrid nfts={activeNfts} />
      </div>

      <LegacyClaimCard />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="tile-border rounded-xl bg-bg-deep/50 p-4 sm:col-span-2">
          <DiscordRolesDisplay roles={roles} loading={rolesLoading} error={rolesError} />
        </div>
        <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
          <p className="text-xs uppercase text-muted">$BUX balance</p>
          <p className="mt-1 font-mono text-accent-gold">{formatBux(data.buxBalance)}</p>
        </div>
        <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
          <p className="text-xs uppercase text-muted">Cashout value</p>
          <p className="mt-1 font-mono text-accent-gold">{formatSol(data.cashoutSol)} SOL</p>
        </div>
      </div>

      <button
        type="button"
        disabled
        className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep opacity-50"
      >
        Cash out $BUX (coming soon)
      </button>
    </div>
  );
}

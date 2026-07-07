"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { buxPage, tokenConfig } from "@/content/site";

type TokenMetrics = {
  totalSupply: number;
  heldPublicSupply: number;
  publicSupply: number;
  exemptSupply: number;
  unclaimedStakingRewards: number;
  unclaimedDiscordRewards: number;
  walletBalanceSol: number;
  liquidityWallet: string;
  solPrice: number;
  tokenValue: number;
  tokenValueUsd: number;
};

type HolderRow = {
  discord_id: string;
  discord_username: string;
  has_discord: boolean;
  nfts: string;
  bux: string;
  value: string;
};

function formatSupply(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(6);
  }
  return value.toFixed(2);
}


function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg">{value}</dd>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default function BuxPage() {
  const [viewType, setViewType] = useState("bux,nfts");
  const [collection, setCollection] = useState("all");
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const liquidityWallet = metrics?.liquidityWallet ?? tokenConfig.communityWallet;

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/token-metrics").then((r) => (r.ok ? r.json() : Promise.reject(new Error("Metrics failed")))),
      fetch(`/api/top-holders?type=${encodeURIComponent(viewType)}&collection=${encodeURIComponent(collection)}`).then(
        (r) => (r.ok ? r.json() : Promise.reject(new Error("Holders failed"))),
      ),
    ])
      .then(([metricsData, holdersData]) => {
        setMetrics(metricsData as TokenMetrics);
        setHolders((holdersData as { holders: HolderRow[] }).holders ?? []);
      })
      .catch((err: Error) => {
        setError(err.message);
        setHolders([]);
      })
      .finally(() => setLoading(false));
  }, [viewType, collection]);

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-3xl font-bold md:text-4xl">{buxPage.headline}</h1>

        <Card glow="gold" className="mt-6 overflow-hidden p-0">
          <div className="grid lg:grid-cols-2">
            <div className="border-b border-border/50 p-6 md:p-8 lg:border-b-0 lg:border-r">
              <p className="text-2xl font-bold text-accent-gold">{tokenConfig.name}</p>
              <a
                href={`https://solscan.io/token/${tokenConfig.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block break-all font-mono text-xs text-accent-cyan hover:underline"
                title={tokenConfig.mint}
              >
                {tokenConfig.mint}
              </a>

              <p className="mt-6 text-sm uppercase tracking-wide text-muted">{buxPage.liquidityLabel}</p>
              <p className="mt-2 font-mono text-4xl font-bold text-accent-gold md:text-5xl">
                {metrics ? `${formatSol(metrics.walletBalanceSol)} SOL` : loading ? "…" : "—"}
              </p>
              {metrics && metrics.solPrice > 0 ? (
                <p className="mt-2 font-mono text-sm text-muted">
                  ≈ $
                  {(metrics.walletBalanceSol * metrics.solPrice).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}{" "}
                  USD
                </p>
              ) : null}
              <a
                href={`https://solscan.io/account/${liquidityWallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block break-all font-mono text-sm text-muted hover:text-accent-cyan hover:underline"
                title={liquidityWallet}
              >
                {liquidityWallet}
              </a>
            </div>

            <div className="border-b border-border/50 p-6 md:p-8 lg:border-b-0">
              <h2 className="text-xl font-semibold">Token stats</h2>
              <p className="mt-2 text-xs text-muted">{buxPage.supplyBreakdownNote}</p>

              <dl className="mt-4 grid grid-cols-2 gap-4">
                <StatTile
                  label="Total supply"
                  value={metrics ? formatSupply(metrics.totalSupply) : loading ? "…" : "—"}
                />
                <StatTile
                  label="Exempt supply"
                  value={metrics ? formatSupply(metrics.exemptSupply) : loading ? "…" : "—"}
                  hint="BUX treasury + staking pool wallets"
                />
                <StatTile
                  label="Unclaimed staking rewards"
                  value={metrics ? formatSupply(metrics.unclaimedStakingRewards) : loading ? "…" : "—"}
                  hint="Accrued on GraveStake, not yet claimed"
                />
                <StatTile
                  label="Unclaimed Discord rewards"
                  value={metrics ? formatSupply(metrics.unclaimedDiscordRewards) : loading ? "…" : "—"}
                  hint="Hub balances not yet claimed to wallet"
                />
              </dl>
            </div>
          </div>

          <dl className="grid gap-4 border-t border-border/50 p-6 sm:grid-cols-3 md:px-8 md:py-6">
            <StatTile
              label="Public supply"
              value={metrics ? formatSupply(metrics.publicSupply) : loading ? "…" : "—"}
              hint="Held in wallets + unclaimed rewards"
            />
            <StatTile
              label="Token value"
              value={metrics ? `${formatSol(metrics.tokenValue)} SOL` : loading ? "…" : "—"}
              hint="Wallet balance ÷ public supply"
            />
            <StatTile
              label="USD value"
              value={metrics ? `$${metrics.tokenValueUsd.toFixed(4)}` : loading ? "…" : "—"}
            />
          </dl>
        </Card>

        <Card className="mt-4 space-y-4 p-5">
          {buxPage.principles.map((line) => (
            <p key={line} className="text-sm text-muted">
              {line}
            </p>
          ))}
        </Card>
      </section>

      <section>
        <Card className="p-5">
          <h2 className="mb-4 text-xl font-semibold">Revenue sources</h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {buxPage.revenueSources.map((source) => (
              <li key={source.title}>
                <p className="font-medium">{source.title}</p>
                <p className="text-sm text-muted">{source.description}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 border-t border-border/50 pt-4">
            <p className="font-medium">{buxPage.revenueHighlight.title}</p>
            <p className="text-sm text-muted">{buxPage.revenueHighlight.description}</p>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader
          eyebrow="Leaderboard"
          title="Top holders"
          description={buxPage.leaderboardNote}
        />
        <Card className="p-5">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <select
              value={viewType}
              onChange={(e) => setViewType(e.target.value)}
              className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm"
            >
              {buxPage.leaderboardFilters.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            {viewType === "nfts" && (
              <select
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm"
              >
                <option value="all">All collections</option>
                {buxPage.collectionFilterOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-muted">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Holder</th>
                  {(viewType === "bux,nfts" || viewType === "nfts") && (
                    <th className="pb-3 pr-4">NFTs</th>
                  )}
                  {(viewType === "bux,nfts" || viewType === "bux") && (
                    <th className="pb-3 pr-4">$BUX</th>
                  )}
                  <th className="pb-3">Value</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      Loading holders…
                    </td>
                  </tr>
                ) : holders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted">
                      {error ? "Could not load holder data." : "No holders found."}
                    </td>
                  </tr>
                ) : (
                  holders.map((row, index) => (
                    <tr key={row.discord_id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-4 font-mono text-accent-gold">#{index + 1}</td>
                      <td className="py-3 pr-4">
                        <span
                          className={row.has_discord ? "font-medium text-accent-green" : "font-mono text-muted"}
                          title={row.has_discord ? "Linked Hub user" : row.discord_username}
                        >
                          {row.discord_username}
                        </span>
                      </td>
                      {(viewType === "bux,nfts" || viewType === "nfts") && (
                        <td className="py-3 pr-4 font-mono">{row.nfts}</td>
                      )}
                      {(viewType === "bux,nfts" || viewType === "bux") && (
                        <td className="py-3 pr-4 font-mono">{row.bux}</td>
                      )}
                      <td className="py-3 font-mono">{row.value}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {error && <p className="mt-4 text-xs text-red-400">{error}</p>}
        </Card>
      </section>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { buxPage, tokenConfig } from "@/content/site";

type TokenMetrics = {
  totalSupply: number;
  publicSupply: number;
  exemptSupply: number;
  liquidityPool: number;
  solPrice: number;
  tokenValue: number;
  tokenValueUsd: number;
};

type HolderRow = {
  discord_id: string;
  discord_username: string;
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

export default function BuxPage() {
  const [viewType, setViewType] = useState("bux,nfts");
  const [collection, setCollection] = useState("all");
  const [metrics, setMetrics] = useState<TokenMetrics | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <Card className="mt-6 space-y-4 p-5">
          {buxPage.principles.map((line) => (
            <p key={line} className="text-sm text-muted">
              {line}
            </p>
          ))}
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card glow="gold" className="p-5">
          <h2 className="mb-4 text-xl font-semibold">Token metrics</h2>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-muted">Total supply</dt>
              <dd className="font-mono text-lg">
                {metrics ? formatSupply(metrics.totalSupply) : loading ? "…" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Public supply</dt>
              <dd className="font-mono text-lg">
                {metrics ? formatSupply(metrics.publicSupply) : loading ? "…" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Exempt supply</dt>
              <dd className="font-mono text-lg">
                {metrics ? formatSupply(metrics.exemptSupply) : loading ? "…" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Liquidity pool</dt>
              <dd className="font-mono text-lg">
                {metrics ? `${formatSol(metrics.liquidityPool)} SOL` : loading ? "…" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Token value</dt>
              <dd className="font-mono text-lg">
                {metrics ? `${formatSol(metrics.tokenValue)} SOL` : loading ? "…" : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted">USD value</dt>
              <dd className="font-mono text-lg">
                {metrics ? `$${metrics.tokenValueUsd.toFixed(4)}` : loading ? "…" : "—"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 break-all font-mono text-[10px] text-muted">
            Mint: {tokenConfig.mint}
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-xl font-semibold">Revenue sources</h2>
          <ul className="space-y-4">
            {buxPage.revenueSources.map((source) => (
              <li key={source.title}>
                <p className="font-medium">{source.title}</p>
                <p className="text-sm text-muted">{source.description}</p>
              </li>
            ))}
          </ul>
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
                  <th className="pb-3 pr-4">Discord</th>
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
                      <td className="py-3 pr-4">{row.discord_username}</td>
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

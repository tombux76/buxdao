"use client";

import { useState } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { buxPage, tokenConfig } from "@/content/site";

export default function BuxPage() {
  const [viewType, setViewType] = useState("bux,nfts");
  const [collection, setCollection] = useState("all");

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
              <dd className="font-mono text-lg">{buxPage.mockMetrics.totalSupply}</dd>
            </div>
            <div>
              <dt className="text-muted">Public supply</dt>
              <dd className="font-mono text-lg">{buxPage.mockMetrics.publicSupply}</dd>
            </div>
            <div>
              <dt className="text-muted">Exempt supply</dt>
              <dd className="font-mono text-lg">{buxPage.mockMetrics.exemptSupply}</dd>
            </div>
            <div>
              <dt className="text-muted">Liquidity pool</dt>
              <dd className="font-mono text-lg">{buxPage.mockMetrics.liquidityPool} SOL</dd>
            </div>
            <div>
              <dt className="text-muted">Token value</dt>
              <dd className="font-mono text-lg">{buxPage.mockMetrics.tokenValueSol} SOL</dd>
            </div>
            <div>
              <dt className="text-muted">USD value</dt>
              <dd className="font-mono text-lg">${buxPage.mockMetrics.tokenValueUsd}</dd>
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
                {buxPage.mockLeaderboard.map((row) => (
                  <tr key={row.rank} className="border-b border-border/50 last:border-0">
                    <td className="py-3 pr-4 font-mono text-accent-gold">#{row.rank}</td>
                    <td className="py-3 pr-4">{row.discord}</td>
                    {(viewType === "bux,nfts" || viewType === "nfts") && (
                      <td className="py-3 pr-4 font-mono">{row.nfts}</td>
                    )}
                    {(viewType === "bux,nfts" || viewType === "bux") && (
                      <td className="py-3 pr-4 font-mono">{row.bux}</td>
                    )}
                    <td className="py-3 font-mono">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted">Mock data — will connect to holder API.</p>
        </Card>
      </section>
    </div>
  );
}

"use client";

import { AlertCircle, Loader2, Trophy, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { buxPage } from "@/content/site";

export type HolderRow = {
  discord_id: string;
  discord_username: string;
  has_discord: boolean;
  nfts: string;
  bux: string;
  value: string;
};

type BuxLeaderboardSectionProps = {
  viewType: string;
  collection: string;
  onViewTypeChange: (value: string) => void;
  onCollectionChange: (value: string) => void;
  holders: HolderRow[];
  loading: boolean;
  error: string | null;
};

export function BuxLeaderboardSection({
  viewType,
  collection,
  onViewTypeChange,
  onCollectionChange,
  holders,
  loading,
  error,
}: BuxLeaderboardSectionProps) {
  return (
    <section>
      <SectionHeader
        eyebrow="Leaderboard"
        title="Top holders"
        description={buxPage.leaderboardNote}
      />

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-bg-deep/30 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Users className="h-4 w-4 text-accent-purple" />
            Filter rankings
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={viewType}
              onChange={(e) => onViewTypeChange(e.target.value)}
              className="rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-sm focus:border-accent-purple/50 focus:outline-none focus:ring-1 focus:ring-accent-purple/30"
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
                onChange={(e) => onCollectionChange(e.target.value)}
                className="rounded-xl border border-border bg-bg-surface px-3 py-2.5 text-sm focus:border-accent-purple/50 focus:outline-none focus:ring-1 focus:ring-accent-purple/30"
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
        </div>

        <div className="overflow-x-auto p-4 sm:p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                <th className="pb-3 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-accent-gold" />
                    Rank
                  </span>
                </th>
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
                  <td colSpan={5} className="py-12 text-center">
                    <div className="inline-flex items-center gap-2 text-muted">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading holders…
                    </div>
                  </td>
                </tr>
              ) : holders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted">
                    {error ? "Could not load holder data." : "No holders found."}
                  </td>
                </tr>
              ) : (
                holders.map((row, index) => (
                  <tr
                    key={row.discord_id}
                    className="border-b border-border/50 last:border-0 transition hover:bg-bg-surface/20"
                  >
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 font-mono text-xs font-semibold ${
                          index < 3
                            ? "bg-accent-gold/15 text-accent-gold"
                            : "bg-bg-surface text-muted"
                        }`}
                      >
                        #{index + 1}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          row.has_discord
                            ? "font-medium text-accent-green"
                            : "font-mono text-muted"
                        }
                        title={row.has_discord ? "Linked Hub user" : row.discord_username}
                      >
                        {row.discord_username}
                      </span>
                    </td>
                    {(viewType === "bux,nfts" || viewType === "nfts") && (
                      <td className="py-3 pr-4 font-mono">{row.nfts}</td>
                    )}
                    {(viewType === "bux,nfts" || viewType === "bux") && (
                      <td className="py-3 pr-4 font-mono text-accent-gold">{row.bux}</td>
                    )}
                    <td className="py-3 font-mono">{row.value}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {error && (
          <div className="flex items-start gap-2 border-t border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400 sm:px-5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}
      </Card>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { BuxLeaderboardSection, type HolderRow } from "@/components/bux/BuxLeaderboardSection";
import { BuxMetricsSection, type BuxMetricsDisplay } from "@/components/bux/BuxMetricsSection";
import { BuxRevenueSection } from "@/components/bux/BuxRevenueSection";

export default function BuxPage() {
  const [viewType, setViewType] = useState("bux,nfts");
  const [collection, setCollection] = useState("all");
  const [metrics, setMetrics] = useState<BuxMetricsDisplay | null>(null);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      fetch("/api/token-metrics").then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("Metrics failed")),
      ),
      fetch(
        `/api/top-holders?type=${encodeURIComponent(viewType)}&collection=${encodeURIComponent(collection)}`,
      ).then((r) => (r.ok ? r.json() : Promise.reject(new Error("Holders failed")))),
    ])
      .then(([metricsData, holdersData]) => {
        setMetrics(metricsData as BuxMetricsDisplay);
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
      <BuxMetricsSection metrics={metrics} loading={loading && !metrics} />
      <BuxRevenueSection />
      <BuxLeaderboardSection
        viewType={viewType}
        collection={collection}
        onViewTypeChange={setViewType}
        onCollectionChange={setCollection}
        holders={holders}
        loading={loading}
        error={error}
      />
    </div>
  );
}

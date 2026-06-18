"use client";

import { useCallback, useEffect, useState } from "react";

export type HolderRewardState = {
  unclaimedBalanceBux: number;
  totalClaimedBux: number;
  claimFeeSol: number;
  linkedWallets: string[];
  recentAccruals: { rewardDateEt: string; amountBux: number; nftCount: number }[];
};

export function useHolderRewards() {
  const [state, setState] = useState<HolderRewardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/holder-rewards/state", { cache: "no-store" });
      if (res.status === 404) {
        setState(null);
        setError("Holder rewards are not enabled on this environment.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Failed to load rewards");
      }
      const data = (await res.json()) as HolderRewardState;
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rewards");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, error, refresh };
}

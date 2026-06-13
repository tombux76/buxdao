"use client";

import { useCallback, useEffect, useState } from "react";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";
import type { LegacyClaimState } from "@/lib/hub/legacy-claim";

export function useLegacyClaim() {
  const { wallets, loading: walletsLoading } = useLinkedWallets();
  const [state, setState] = useState<LegacyClaimState | null>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasLinkedWallet = wallets.length > 0;

  const refresh = useCallback(async () => {
    if (!hasLinkedWallet) {
      setState(null);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/legacy-claim");
      if (!response.ok) {
        setState(null);
        setError("Failed to load claim status");
        return;
      }
      const data = (await response.json()) as LegacyClaimState;
      setState(data);
      setError(null);
    } catch {
      setState(null);
      setError("Failed to load claim status");
    } finally {
      setLoading(false);
    }
  }, [hasLinkedWallet]);

  useEffect(() => {
    if (walletsLoading) return;
    void refresh();
  }, [refresh, walletsLoading]);

  const claim = useCallback(async () => {
    setClaiming(true);
    setError(null);
    try {
      const response = await fetch("/api/hub/legacy-claim", { method: "POST" });
      const data = (await response.json()) as LegacyClaimState & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Claim failed");
      }
      setState(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Claim failed";
      setError(message);
      await refresh();
      throw err;
    } finally {
      setClaiming(false);
    }
  }, [refresh]);

  return {
    state,
    loading: walletsLoading || loading,
    claiming,
    error,
    refresh,
    claim,
  };
}

"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type ClaimRewardState = {
  unclaimedBalanceBux: number;
  totalClaimedBux: number;
  todayEngagement: {
    rewardDateEt: string;
    messagesCount: number;
    reactionsCount: number;
    messagesBux: number;
    reactionsBux: number;
    totalEngagementBux: number;
  };
};

function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function HubClaimSection() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<ClaimRewardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = status === "authenticated" && !!session?.user;

  useEffect(() => {
    if (!isAuthenticated) {
      setState(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch("/api/holder-rewards/state")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to load claim balance");
        }
        return res.json() as Promise<ClaimRewardState>;
      })
      .then(setState)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="tile-border space-y-4 rounded-xl bg-bg-deep/50 p-4 sm:p-5">
      <div>
        <p className="text-xs uppercase text-muted">Claim rewards</p>
        <p className="mt-1 text-sm text-muted">
          Separate from GraveStake staking. Earn via Discord engagement; admins can grant bonus credits.
        </p>
      </div>

      {loading && <p className="text-sm text-muted">Loading claim balance…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {state && !loading && !error && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-bg-deep/40 p-4">
              <p className="text-xs uppercase text-muted">Unclaimed balance</p>
              <p className="mt-1 font-mono text-2xl text-accent-gold">
                {formatBux(state.unclaimedBalanceBux)} <span className="text-base">$BUX</span>
              </p>
            </div>
            <div className="rounded-xl border border-border bg-bg-deep/40 p-4">
              <p className="text-xs uppercase text-muted">Today&apos;s Discord engagement</p>
              <p className="mt-1 text-sm">
                <span className="font-medium">{state.todayEngagement.messagesCount}</span> messages ·{" "}
                <span className="font-medium">{state.todayEngagement.reactionsCount}</span> reactions
              </p>
              <p className="mt-1 font-mono text-accent-gold">
                +{formatBux(state.todayEngagement.totalEngagementBux)} $BUX today
              </p>
              <p className="mt-1 text-xs text-muted">Resets midnight US Eastern</p>
            </div>
          </div>

          <button
            type="button"
            disabled
            className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep opacity-50"
          >
            Claim — coming soon
          </button>
        </>
      )}
    </div>
  );
}

"use client";

import { Check, Coins } from "lucide-react";
import { useLegacyClaim } from "@/hooks/useLegacyClaim";

function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function LegacyClaimCard() {
  const { state, loading, claiming, error, claim } = useLegacyClaim();

  if (loading) {
    return (
      <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
        <p className="text-sm text-muted">Checking legacy rewards…</p>
      </div>
    );
  }

  if (!state || state.status === "none") {
    return null;
  }

  const showClaimButton = state.status === "pending";

  return (
    <div className="tile-border rounded-xl bg-bg-deep/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Coins className="h-4 w-4 text-accent-gold" strokeWidth={2.25} />
        <p className="text-xs uppercase text-muted">Legacy staking rewards</p>
      </div>

      {state.status === "claimed" ? (
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/10 px-3 py-2 text-sm font-semibold text-accent-green">
            <Check className="h-4 w-4 shrink-0" strokeWidth={2.5} />
            Claimed {formatBux(state.amountBux)} $BUX
          </div>
          {state.txSignature && (
            <a
              href={`https://solscan.io/tx/${state.txSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-accent-cyan hover:underline"
            >
              View transaction
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="font-mono text-2xl text-accent-gold">{formatBux(state.amountBux)} $BUX</p>
          {state.message && <p className="text-sm text-muted">{state.message}</p>}
          {showClaimButton && (
            <button
              type="button"
              disabled={claiming}
              onClick={() => void claim().catch(() => undefined)}
              className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {claiming ? "Claiming…" : `Claim ${formatBux(state.amountBux)} $BUX`}
            </button>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}
    </div>
  );
}

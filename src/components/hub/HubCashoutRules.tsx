"use client";

import { useEffect, useState } from "react";
import {
  BUXDAO5_FEE_BPS,
  DEFAULT_FEE_BPS,
  MAX_CASHOUT_SOL_NET,
  WHALE_REQUIRED_ABOVE_SOL_NET,
} from "@/lib/cashout/config";
import { cashoutContent } from "@/content/site";
import { collectionConfigs } from "@/content/site";

function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(6);
  }
  return value.toFixed(4);
}

export function HubCashoutRules() {
  const [tokenValue, setTokenValue] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/token-metrics")
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        const body = (await res.json()) as { tokenValue?: number };
        return body.tokenValue ?? null;
      })
      .then(setTokenValue)
      .catch(() => null);
  }, []);

  const defaultFeePercent = DEFAULT_FEE_BPS / 100;
  const buxdao5FeePercent = BUXDAO5_FEE_BPS / 100;
  const collectionNames = collectionConfigs.map((c) => c.name).join(", ");

  return (
    <div className="space-y-4 rounded-xl border border-border/80 bg-bg-deep/30 p-4">
      <div>
        <p className="text-sm font-medium">{cashoutContent.howItWorks.title}</p>
        <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-muted">
          {cashoutContent.howItWorks.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        {tokenValue != null && tokenValue > 0 && (
          <p className="mt-2 text-xs text-muted">
            Current rate:{" "}
            <span className="font-mono text-accent-gold">{formatSol(tokenValue)} SOL</span> per $BUX
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-muted">{cashoutContent.requirements.title}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            {cashoutContent.requirements.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-accent-purple">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Eligible collections: {collectionNames}.
          </p>
        </div>

        <div>
          <p className="text-xs uppercase text-muted">{cashoutContent.perks.title}</p>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li className="flex gap-2">
              <span className="text-accent-gold">•</span>
              <span>
                <strong className="text-foreground">{defaultFeePercent}% fee</strong> for verified
                collection holders
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-gold">•</span>
              <span>
                <strong className="text-foreground">{buxdao5FeePercent}% fee</strong> with the BUX$DAO
                5 Discord role (verified holder across all five collections)
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-cyan">•</span>
              <span>
                <strong className="text-foreground">Whale roles (🐋)</strong> required for net payouts
                above {WHALE_REQUIRED_ABOVE_SOL_NET} SOL
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-accent-cyan">•</span>
              <span>
                Up to <strong className="text-foreground">{MAX_CASHOUT_SOL_NET} SOL net</strong> per
                cashout
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

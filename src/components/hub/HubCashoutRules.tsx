"use client";

import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BadgePercent,
  Clock,
  Coins,
  Crown,
  Gem,
  Link2,
  MessageCircle,
  ShieldCheck,
  Timer,
  TrendingUp,
  Wallet,
  Waves,
} from "lucide-react";
import {
  BUXDAO5_FEE_BPS,
  CASHOUT_COOLDOWN_DAYS,
  DEFAULT_FEE_BPS,
  MAX_CASHOUT_SOL_NET,
  WHALE_REQUIRED_ABOVE_SOL_NET,
} from "@/lib/cashout/config";
import { cashoutContent, collectionConfigs } from "@/content/site";

function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(6);
  }
  return value.toFixed(4);
}

function RuleCard({
  icon: Icon,
  iconClass,
  title,
  children,
}: {
  icon: LucideIcon;
  iconClass: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-bg-surface/40 p-4">
      <div className="mb-3 flex items-center gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <p className="text-sm font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

function DefRow({
  icon: Icon,
  iconClass,
  label,
  detail,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: React.ReactNode;
  detail: string;
}) {
  return (
    <li className="flex gap-3 rounded-lg bg-bg-deep/40 px-3 py-2.5">
      <span
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${iconClass}`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>
      </div>
    </li>
  );
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

  return (
    <div className="space-y-4">
      {/* Flow */}
      <div className="overflow-hidden rounded-xl border border-accent-gold/20 bg-gradient-to-br from-accent-gold/5 via-bg-deep/40 to-accent-purple/5 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent-gold" />
          <p className="text-sm font-semibold">{cashoutContent.howItWorks.title}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="flex gap-3 rounded-xl border border-border/60 bg-bg-deep/50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-gold/15 text-accent-gold">
              <Coins className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Send $BUX</p>
              <p className="mt-0.5 text-xs text-muted">
                Sign an SPL transfer from your linked wallet to the liquidity pool.
              </p>
            </div>
          </div>

          <ArrowRight className="mx-auto hidden h-5 w-5 shrink-0 text-muted sm:block" />

          <div className="flex gap-3 rounded-xl border border-border/60 bg-bg-deep/50 p-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-cyan/15 text-accent-cyan">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-medium">Receive SOL</p>
              <p className="mt-0.5 text-xs text-muted">
                Net SOL is sent automatically at the live token rate. Fees stay in the pool.
              </p>
            </div>
          </div>
        </div>

        {tokenValue != null && tokenValue > 0 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-2.5 py-1 font-medium text-accent-gold">
              <TrendingUp className="h-3 w-3" />
              Live rate
            </span>
            <span className="font-mono text-sm text-foreground">
              {formatSol(tokenValue)} SOL
            </span>
            <span>per $BUX</span>
          </p>
        )}
      </div>

      {/* Definition cards */}
      <div className="grid gap-3 lg:grid-cols-3">
        <RuleCard
          icon={ShieldCheck}
          iconClass="bg-accent-purple/15 text-accent-purple"
          title={cashoutContent.requirements.title}
        >
          <ul className="space-y-2">
            <DefRow
              icon={MessageCircle}
              iconClass="bg-[#5865F2]/15 text-[#5865F2]"
              label="Discord login"
              detail="Holder Hub uses your Discord identity for roles and eligibility."
            />
            <DefRow
              icon={Link2}
              iconClass="bg-accent-cyan/15 text-accent-cyan"
              label="Linked payout wallet"
              detail="Connect and link the Solana wallet that should receive SOL."
            />
            <DefRow
              icon={Gem}
              iconClass="bg-accent-gold/15 text-accent-gold"
              label="Collection holder"
              detail={`Hold at least one NFT from ${collectionConfigs.map((c) => c.name).join(", ")} in a linked wallet.`}
            />
          </ul>
        </RuleCard>

        <RuleCard
          icon={BadgePercent}
          iconClass="bg-accent-gold/15 text-accent-gold"
          title={cashoutContent.perks.title}
        >
          <ul className="space-y-2">
            <DefRow
              icon={BadgePercent}
              iconClass="bg-accent-gold/15 text-accent-gold"
              label={<>{defaultFeePercent}% cashout fee</>}
              detail="Standard rate for verified holders of any BUXDAO collection."
            />
            <DefRow
              icon={Crown}
              iconClass="bg-accent-green/15 text-accent-green"
              label={<>{buxdao5FeePercent}% with BUX$DAO 5</>}
              detail="Lower fee when you hold verified roles across all five collections."
            />
          </ul>
        </RuleCard>

        <RuleCard
          icon={Timer}
          iconClass="bg-accent-cyan/15 text-accent-cyan"
          title={cashoutContent.limits.title}
        >
          <ul className="space-y-2">
            <DefRow
              icon={Clock}
              iconClass="bg-amber-500/15 text-amber-400"
              label={<>{CASHOUT_COOLDOWN_DAYS}-day cooldown</>}
              detail="One cashout per Hub account every 14 days — timer starts when SOL is paid out."
            />
            <DefRow
              icon={Coins}
              iconClass="bg-accent-cyan/15 text-accent-cyan"
              label={<>Up to {MAX_CASHOUT_SOL_NET} SOL net</>}
              detail="Maximum SOL you receive per cashout, after the holder fee."
            />
            <DefRow
              icon={Waves}
              iconClass="bg-accent-purple/15 text-accent-purple"
              label="Whale role for large cashouts"
              detail={`Net payouts above ${WHALE_REQUIRED_ABOVE_SOL_NET} SOL require a 🐋 Discord role in at least one collection.`}
            />
          </ul>
        </RuleCard>
      </div>
    </div>
  );
}

export function HubCashoutHeader() {
  return (
    <div className="flex gap-4">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-gold/25 to-accent-purple/20 ring-1 ring-accent-gold/30">
        <Coins className="h-6 w-6 text-accent-gold" />
      </span>
      <div className="min-w-0">
        <h3 className="text-lg font-semibold tracking-tight">{cashoutContent.title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{cashoutContent.intro}</p>
      </div>
    </div>
  );
}

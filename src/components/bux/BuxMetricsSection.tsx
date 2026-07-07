"use client";

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Coins,
  ExternalLink,
  Globe,
  Lock,
  MessageCircle,
  Sprout,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { buxPage, tokenConfig } from "@/content/site";

export type BuxMetricsDisplay = {
  totalSupply: number;
  heldPublicSupply: number;
  publicSupply: number;
  exemptSupply: number;
  unclaimedStakingRewards: number;
  unclaimedDiscordRewards: number;
  walletBalanceSol: number;
  liquidityWallet: string;
  solPrice: number;
  tokenValue: number;
  tokenValueUsd: number;
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

function MetricTile({
  icon: Icon,
  iconClass,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-bg-surface/30 p-3.5">
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
          <p className="mt-0.5 font-mono text-base font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{detail}</p>
        </div>
      </div>
    </div>
  );
}

function PrincipleRow({
  icon: Icon,
  iconClass,
  text,
}: {
  icon: LucideIcon;
  iconClass: string;
  text: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border/50 bg-bg-deep/40 px-4 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconClass}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <p className="text-sm leading-relaxed text-muted">{text}</p>
    </li>
  );
}

type BuxMetricsSectionProps = {
  metrics: BuxMetricsDisplay | null;
  loading: boolean;
};

export function BuxMetricsSection({ metrics, loading }: BuxMetricsSectionProps) {
  const liquidityWallet = metrics?.liquidityWallet ?? tokenConfig.communityWallet;
  const dash = loading ? "…" : "—";

  return (
    <section>
      <div className="flex gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-gold/25 to-accent-purple/20 ring-1 ring-accent-gold/30">
          <Coins className="h-7 w-7 text-accent-gold" />
        </span>
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">{buxPage.headline}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            {buxPage.supplyBreakdownNote}
          </p>
        </div>
      </div>

      <Card glow="gold" className="mt-6 overflow-hidden p-0">
        {/* Liquidity hero */}
        <div className="border-b border-border/50 bg-gradient-to-br from-accent-gold/8 via-bg-deep/30 to-accent-purple/5 p-6 md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-2xl font-bold text-accent-gold">{tokenConfig.name}</p>
              <a
                href={`https://solscan.io/token/${tokenConfig.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 break-all font-mono text-xs text-accent-cyan hover:underline"
                title={tokenConfig.mint}
              >
                {tokenConfig.mint.slice(0, 8)}…{tokenConfig.mint.slice(-8)}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-gold/30 bg-accent-gold/10 px-3 py-1 text-xs font-medium text-accent-gold">
              <Wallet className="h-3.5 w-3.5" />
              Liquidity-backed
            </span>
          </div>

          <p className="mt-6 flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
            <Wallet className="h-3.5 w-3.5" />
            {buxPage.liquidityLabel}
          </p>
          <p className="mt-2 font-mono text-4xl font-bold text-accent-gold md:text-5xl">
            {metrics ? `${formatSol(metrics.walletBalanceSol)} SOL` : dash}
          </p>
          {metrics && metrics.solPrice > 0 ? (
            <p className="mt-2 font-mono text-sm text-muted">
              ≈ $
              {(metrics.walletBalanceSol * metrics.solPrice).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}{" "}
              USD in pool
            </p>
          ) : null}
          <a
            href={`https://solscan.io/account/${liquidityWallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 font-mono text-xs text-muted hover:text-accent-cyan"
            title={liquidityWallet}
          >
            {liquidityWallet.slice(0, 6)}…{liquidityWallet.slice(-6)}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Value formula */}
        <div className="border-b border-border/50 px-6 py-5 md:px-8">
          <div className="mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent-cyan" />
            <p className="text-sm font-semibold">How token value is calculated</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            <div className="rounded-xl border border-border/60 bg-bg-deep/50 px-4 py-3 text-center sm:text-left">
              <p className="text-[11px] uppercase text-muted">Liquidity wallet</p>
              <p className="mt-1 font-mono text-sm font-semibold text-accent-gold">
                {metrics ? `${formatSol(metrics.walletBalanceSol)} SOL` : dash}
              </p>
            </div>
            <span className="hidden text-center font-mono text-lg text-muted sm:block">÷</span>
            <div className="rounded-xl border border-border/60 bg-bg-deep/50 px-4 py-3 text-center sm:text-left">
              <p className="text-[11px] uppercase text-muted">Public supply</p>
              <p className="mt-1 font-mono text-sm font-semibold">
                {metrics ? formatSupply(metrics.publicSupply) : dash} $BUX
              </p>
            </div>
            <ArrowRight className="mx-auto hidden h-5 w-5 text-muted sm:block" />
            <div className="rounded-xl border border-accent-cyan/25 bg-accent-cyan/5 px-4 py-3 text-center sm:text-left">
              <p className="text-[11px] uppercase text-muted">Token value</p>
              <p className="mt-1 font-mono text-sm font-semibold text-accent-cyan">
                {metrics ? `${formatSol(metrics.tokenValue)} SOL` : dash}
                {metrics ? ` · $${metrics.tokenValueUsd.toFixed(4)}` : ""}
              </p>
            </div>
          </div>
        </div>

        {/* Supply breakdown */}
        <div className="p-6 md:p-8">
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-accent-purple" />
            <h2 className="text-lg font-semibold">Supply breakdown</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricTile
              icon={Coins}
              iconClass="bg-accent-gold/15 text-accent-gold"
              label="Total supply"
              value={metrics ? formatSupply(metrics.totalSupply) : dash}
              detail="All $BUX tracked on-chain across holder wallets and exempt addresses."
            />
            <MetricTile
              icon={Lock}
              iconClass="bg-accent-purple/15 text-accent-purple"
              label="Exempt supply"
              value={metrics ? formatSupply(metrics.exemptSupply) : dash}
              detail="Treasury and GraveStake pool wallets — not counted as public circulating supply."
            />
            <MetricTile
              icon={Globe}
              iconClass="bg-accent-cyan/15 text-accent-cyan"
              label="Public supply"
              value={metrics ? formatSupply(metrics.publicSupply) : dash}
              detail="Wallet-held $BUX plus unclaimed staking and Discord rewards."
            />
            <MetricTile
              icon={Sprout}
              iconClass="bg-accent-green/15 text-accent-green"
              label="Unclaimed staking"
              value={metrics ? formatSupply(metrics.unclaimedStakingRewards) : dash}
              detail="Accrued on GraveStake pools, not yet claimed to wallets."
            />
            <MetricTile
              icon={MessageCircle}
              iconClass="bg-[#5865F2]/15 text-[#5865F2]"
              label="Unclaimed Discord"
              value={metrics ? formatSupply(metrics.unclaimedDiscordRewards) : dash}
              detail="Hub engagement balances not yet claimed on-chain."
            />
            <MetricTile
              icon={TrendingUp}
              iconClass="bg-accent-cyan/15 text-accent-cyan"
              label="Live token value"
              value={metrics ? `${formatSol(metrics.tokenValue)} SOL` : dash}
              detail={
                metrics
                  ? `≈ $${metrics.tokenValueUsd.toFixed(4)} USD at current SOL price`
                  : "Wallet balance divided by public supply"
              }
            />
          </div>
        </div>
      </Card>

      {/* Principles */}
      <Card className="mt-4 overflow-hidden p-0">
        <div className="border-b border-border/50 bg-bg-deep/30 px-5 py-4">
          <p className="text-sm font-semibold">What backs $BUX</p>
          <p className="mt-1 text-xs text-muted">Core principles of the token model</p>
        </div>
        <ul className="space-y-2 p-4 sm:p-5">
          <PrincipleRow
            icon={Coins}
            iconClass="bg-accent-gold/15 text-accent-gold"
            text={buxPage.principles[0]}
          />
          <PrincipleRow
            icon={TrendingUp}
            iconClass="bg-accent-cyan/15 text-accent-cyan"
            text={buxPage.principles[1]}
          />
          <PrincipleRow
            icon={Wallet}
            iconClass="bg-accent-purple/15 text-accent-purple"
            text={buxPage.principles[2]}
          />
        </ul>
      </Card>
    </section>
  );
}

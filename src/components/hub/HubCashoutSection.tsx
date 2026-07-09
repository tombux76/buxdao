"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  AlertCircle,
  ArrowRight,
  BadgePercent,
  CheckCircle2,
  Clock,
  Coins,
  Crown,
  Link2,
  Loader2,
  Timer,
  Wallet,
  Zap,
} from "lucide-react";
import { DiscordLoginButton } from "@/components/hub/ProfileConnectActions";
import { HubCashoutHeader, HubCashoutRules } from "@/components/hub/HubCashoutRules";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";
import { getLatestBlockhashForWallet } from "@/lib/solana/browser-rpc";
import { cashoutContent, tokenConfig } from "@/content/site";

type CashoutEligibility = {
  eligible: boolean;
  reasons: string[];
  hasHolderNft: boolean;
  hasWhaleRole: boolean;
  hasBuxdao5: boolean;
  feeBps: number;
  feePercent: number;
  maxSolNet: number;
  whaleThresholdSol: number;
  minBux: number;
  liquidityWallet: string;
  mint: string;
  buxBalance: number;
  tokenValue: number;
  maxBuxCashout: number;
  liquidityReady: boolean;
  cooldownDays: number;
  cooldownActive: boolean;
  lastCashoutAt: string | null;
  cooldownEndsAt: string | null;
  cooldownDaysRemaining: number;
};

type PrepareCashoutResult = {
  liquidityWallet: string;
  mint: string;
  payoutWallet: string;
  amountRaw: string;
  amountBux: number;
  solGross: number;
  feeSol: number;
  solNet: number;
  feeBps: number;
  feePercent: number;
  tokenValue: number;
};

type CashoutStep = "idle" | "ready" | "sending_bux" | "paying_sol" | "success";

function formatBux(value: number): string {
  return Math.floor(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatSol(value: number): string {
  if (value < 0.01) {
    return value.toFixed(6);
  }
  return value.toFixed(4);
}

function formatCooldownDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

function estimateQuote(amountBux: number, tokenValue: number, feeBps: number) {
  const solGross = amountBux * tokenValue;
  const feeSol = solGross * (feeBps / 10_000);
  return { solGross, feeSol, solNet: solGross - feeSol };
}

function StatTile({
  icon: Icon,
  iconClass,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  iconClass: string;
  label: string;
  value: React.ReactNode;
  sub?: string;
  valueClass?: string;
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
          <p className={`mt-0.5 text-sm font-semibold ${valueClass ?? ""}`}>{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-muted">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function CashoutShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="tile-border overflow-hidden rounded-2xl bg-bg-deep/50">
      <div className="border-b border-border/50 bg-gradient-to-r from-accent-gold/5 via-transparent to-accent-purple/5 px-4 py-5 sm:px-6">
        <HubCashoutHeader />
      </div>
      <div className="space-y-5 p-4 sm:p-6">{children}</div>
    </div>
  );
}

export function HubCashoutSection() {
  const { data: session, status } = useSession();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { wallets } = useLinkedWallets();

  const [eligibility, setEligibility] = useState<CashoutEligibility | null>(null);
  const [amountBux, setAmountBux] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [step, setStep] = useState<CashoutStep>("idle");
  const [prepareData, setPrepareData] = useState<PrepareCashoutResult | null>(null);
  const [cashoutError, setCashoutError] = useState<string | null>(null);
  const [buxTxSignature, setBuxTxSignature] = useState<string | null>(null);
  const [solTxSignature, setSolTxSignature] = useState<string | null>(null);
  const [completedSolNet, setCompletedSolNet] = useState<number | null>(null);

  const isAuthenticated = status === "authenticated" && !!session?.user;
  const walletAddress = publicKey?.toBase58() ?? "";
  const linkedAddresses = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);
  const walletLinked = connected && walletAddress ? linkedAddresses.has(walletAddress) : false;

  const refreshEligibility = useCallback(async () => {
    if (!walletAddress) {
      return null;
    }
    const res = await fetch(`/api/cashout/eligibility?wallet=${encodeURIComponent(walletAddress)}`);
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load cashout eligibility");
    }
    return res.json() as Promise<CashoutEligibility>;
  }, [walletAddress]);

  useEffect(() => {
    if (!isAuthenticated || !walletLinked || !walletAddress) {
      setEligibility(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    refreshEligibility()
      .then((data) => {
        setEligibility(data);
        if (data) {
          setAmountBux((prev) =>
            prev || String(Math.min(data.maxBuxCashout, Math.floor(data.buxBalance))),
          );
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated, walletLinked, walletAddress, refreshEligibility]);

  const parsedAmount = Number.parseInt(amountBux, 10);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount >= (eligibility?.minBux ?? 1);
  const quote =
    eligibility && amountValid
      ? estimateQuote(parsedAmount, eligibility.tokenValue, eligibility.feeBps)
      : null;

  async function resetFlow() {
    if (step !== "success") {
      await fetch("/api/cashout/cancel", { method: "POST" }).catch(() => null);
    }
    setStep("idle");
    setPrepareData(null);
    setCashoutError(null);
    setBuxTxSignature(null);
    setSolTxSignature(null);
    setCompletedSolNet(null);
    const next = await refreshEligibility().catch(() => null);
    if (next) {
      setEligibility(next);
    }
  }

  async function handlePrepare() {
    if (!walletAddress || !amountValid) {
      return;
    }

    setCashoutError(null);
    try {
      const res = await fetch("/api/cashout/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutWallet: walletAddress, amountBux: parsedAmount }),
      });
      const body = (await res.json()) as PrepareCashoutResult & { error?: string };
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to prepare cashout");
      }
      setPrepareData(body);
      setStep("ready");
    } catch (err) {
      setCashoutError(err instanceof Error ? err.message : "Failed to prepare cashout");
    }
  }

  async function handleConfirmCashout(signature: string) {
    const confirmRes = await fetch("/api/cashout/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payoutWallet: walletAddress,
        buxTxSignature: signature,
      }),
    });

    const confirmBody = (await confirmRes.json()) as {
      error?: string;
      solNet?: number;
      solTxSignature?: string;
    };

    if (!confirmRes.ok) {
      throw new Error(confirmBody.error ?? "Failed to complete cashout");
    }

    setSolTxSignature(confirmBody.solTxSignature ?? null);
    setCompletedSolNet(confirmBody.solNet ?? prepareData?.solNet ?? null);
    setStep("success");
    setPrepareData(null);
    const next = await refreshEligibility().catch(() => null);
    if (next) {
      setEligibility(next);
    }
  }

  async function handleSendBux() {
    if (!prepareData || !walletAddress || !sendTransaction) {
      return;
    }

    setStep("sending_bux");
    setCashoutError(null);

    try {
      const mint = new PublicKey(prepareData.mint || tokenConfig.mint);
      const owner = new PublicKey(walletAddress);
      const liquidity = new PublicKey(prepareData.liquidityWallet);
      const amountRaw = BigInt(prepareData.amountRaw);

      const fromAta = await getAssociatedTokenAddress(mint, owner);
      const toAta = await getAssociatedTokenAddress(mint, liquidity);

      const transaction = new Transaction();

      const destInfo = await connection.getAccountInfo(toAta);
      if (!destInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(owner, toAta, liquidity, mint),
        );
      }

      transaction.add(createTransferInstruction(fromAta, toAta, owner, amountRaw));

      const blockhash = await getLatestBlockhashForWallet();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = owner;

      const signature = await sendTransaction(transaction, connection);
      setBuxTxSignature(signature);
      setStep("paying_sol");

      await handleConfirmCashout(signature);
    } catch (err) {
      setStep(buxTxSignature ? "paying_sol" : "ready");
      setCashoutError(err instanceof Error ? err.message : "Cashout failed");
    }
  }

  async function handleRetryConfirm() {
    if (!buxTxSignature || !walletAddress) {
      return;
    }

    setStep("paying_sol");
    setCashoutError(null);

    try {
      await handleConfirmCashout(buxTxSignature);
    } catch (err) {
      setStep("paying_sol");
      setCashoutError(err instanceof Error ? err.message : "Cashout failed");
    }
  }

  if (!isAuthenticated) {
    return (
      <CashoutShell>
        <HubCashoutRules />
        <div className="rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/5 p-4">
          <p className="text-sm text-muted">{cashoutContent.ctaLoggedOut}</p>
          <div className="mt-3">
            <DiscordLoginButton fullWidth />
          </div>
        </div>
      </CashoutShell>
    );
  }

  return (
    <CashoutShell>
      <HubCashoutRules />

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your cashout profile…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!connected && (
        <div className="flex items-start gap-3 rounded-xl border border-border bg-bg-surface/30 p-4 text-sm text-muted">
          <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-accent-cyan" />
          {cashoutContent.ctaNeedWallet}
        </div>
      )}
      {connected && !walletLinked && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
          Link your connected wallet in Hub first.
        </div>
      )}

      {eligibility && walletLinked && step === "idle" && (
        <>
          {!eligibility.eligible && eligibility.reasons.length > 0 && (
            <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              {eligibility.reasons.map((reason) => (
                <div key={reason} className="flex items-start gap-2.5 text-sm text-amber-200">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{reason}</span>
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              icon={eligibility.hasBuxdao5 ? Crown : BadgePercent}
              iconClass={
                eligibility.hasBuxdao5
                  ? "bg-accent-green/15 text-accent-green"
                  : "bg-accent-gold/15 text-accent-gold"
              }
              label="Your fee"
              value={`${eligibility.feePercent}%`}
              sub={
                eligibility.hasBuxdao5
                  ? "BUX$DAO 5 holder rate"
                  : "Standard holder rate"
              }
            />
            <StatTile
              icon={Zap}
              iconClass="bg-accent-cyan/15 text-accent-cyan"
              label="Max per cashout"
              value={`${eligibility.maxSolNet} SOL`}
              sub="Net after fee"
            />
            <StatTile
              icon={eligibility.cooldownActive ? Clock : Timer}
              iconClass={
                eligibility.cooldownActive
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-accent-green/15 text-accent-green"
              }
              label="Cooldown"
              value={
                eligibility.cooldownActive && eligibility.cooldownEndsAt
                  ? `${eligibility.cooldownDaysRemaining}d left`
                  : "Ready"
              }
              sub={
                eligibility.cooldownActive && eligibility.cooldownEndsAt
                  ? `Next ${formatCooldownDate(eligibility.cooldownEndsAt)}`
                  : `${eligibility.cooldownDays}-day between cashouts`
              }
              valueClass={eligibility.cooldownActive ? "text-amber-400" : "text-accent-green"}
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-bg-surface/20 p-4 sm:p-5">
            <label className="block">
              <span className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted">
                <Coins className="h-3.5 w-3.5 text-accent-gold" />
                $BUX amount
              </span>
              <input
                type="number"
                min={eligibility.minBux}
                max={eligibility.maxBuxCashout}
                value={amountBux}
                onChange={(e) => setAmountBux(e.target.value)}
                className="mt-2 w-full rounded-xl border border-border bg-bg-deep px-4 py-3 font-mono text-lg text-accent-gold focus:border-accent-gold/50 focus:outline-none focus:ring-1 focus:ring-accent-gold/30"
              />
              <p className="mt-2 text-xs text-muted">
                Balance {formatBux(eligibility.buxBalance)} $BUX · max{" "}
                {formatBux(eligibility.maxBuxCashout)}
                {!eligibility.hasWhaleRole &&
                  ` · 🐋 required above ${eligibility.whaleThresholdSol} SOL net`}
              </p>
            </label>

            {quote && (
              <div className="mt-4 grid gap-2 rounded-xl border border-accent-gold/20 bg-gradient-to-r from-accent-gold/5 to-accent-cyan/5 p-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div className="text-center sm:text-left">
                  <p className="text-[11px] uppercase text-muted">You send</p>
                  <p className="font-mono text-lg font-semibold text-accent-gold">
                    {formatBux(parsedAmount)} $BUX
                  </p>
                </div>
                <ArrowRight className="mx-auto hidden h-5 w-5 text-muted sm:block" />
                <div className="text-center sm:text-right">
                  <p className="text-[11px] uppercase text-muted">You receive</p>
                  <p className="font-mono text-lg font-semibold text-accent-cyan">
                    {formatSol(quote.solNet)} SOL
                  </p>
                  <p className="text-xs text-muted">
                    Fee {formatSol(quote.feeSol)} SOL ({eligibility.feePercent}%)
                  </p>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={!eligibility.eligible || !amountValid}
              onClick={() => void handlePrepare()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3.5 text-sm font-semibold text-bg-deep transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Coins className="h-4 w-4" />
              Cash out {amountValid ? formatBux(parsedAmount) : "—"} $BUX
            </button>
          </div>
        </>
      )}

      {step === "success" && (
        <div className="rounded-xl border border-accent-green/30 bg-gradient-to-br from-accent-green/15 to-accent-cyan/5 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-green/20">
              <CheckCircle2 className="h-6 w-6 text-accent-green" />
            </span>
            <div className="space-y-2 text-sm">
              <p className="text-lg font-semibold text-accent-green">
                {formatSol(completedSolNet ?? 0)} SOL received
              </p>
              <p className="text-muted">Your cashout completed successfully.</p>
              <div className="flex flex-wrap gap-3 pt-1">
                {buxTxSignature && (
                  <a
                    href={solscanTxUrl(buxTxSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent-cyan hover:underline"
                  >
                    <Coins className="h-3.5 w-3.5" />
                    $BUX transfer
                  </a>
                )}
                {solTxSignature && (
                  <a
                    href={solscanTxUrl(solTxSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-accent-cyan hover:underline"
                  >
                    <Wallet className="h-3.5 w-3.5" />
                    SOL payout
                  </a>
                )}
              </div>
              <button
                type="button"
                onClick={() => void resetFlow()}
                className="mt-2 text-xs text-muted underline hover:text-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {(step === "ready" || step === "sending_bux" || step === "paying_sol") && prepareData && (
        <div className="space-y-4 rounded-xl border border-accent-purple/25 bg-gradient-to-b from-accent-purple/5 to-bg-deep/40 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">Confirm cashout</p>
              <p className="mt-1 font-mono text-lg font-semibold">
                {formatBux(prepareData.amountBux)} $BUX
                <ArrowRight className="mx-2 inline h-4 w-4 text-muted" />
                <span className="text-accent-cyan">{formatSol(prepareData.solNet)} SOL</span>
              </p>
            </div>
            <span className="rounded-full border border-border bg-bg-deep/60 px-3 py-1 text-xs text-muted">
              Fee {prepareData.feePercent}% · {formatSol(prepareData.tokenValue)} SOL/$BUX
            </span>
          </div>

          <ol className="space-y-3">
            <FlowStep
              active={step === "ready" || step === "sending_bux"}
              done={step === "paying_sol"}
              step={1}
              icon={Coins}
              title="Send $BUX to liquidity wallet"
              detail="Approve the SPL transfer in your wallet."
            />
            <FlowStep
              active={step === "paying_sol"}
              done={false}
              step={2}
              icon={Wallet}
              title="Receive SOL payout"
              detail="Paid automatically once $BUX is confirmed on-chain."
            />
          </ol>

          {cashoutError && (
            <div className="flex items-start gap-2 text-sm text-red-400">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {cashoutError}
            </div>
          )}

          {step === "ready" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSendBux()}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3.5 text-sm font-semibold text-bg-deep"
              >
                <Coins className="h-4 w-4" />
                Send $BUX & cash out
              </button>
              <button
                type="button"
                onClick={() => void resetFlow()}
                className="rounded-xl border border-border px-4 py-3.5 text-sm text-muted hover:border-border-strong"
              >
                Cancel
              </button>
            </div>
          )}

          {(step === "sending_bux" || (step === "paying_sol" && !cashoutError)) && (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-bg-deep/50 px-4 py-3 text-sm text-muted">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-cyan" />
              {step === "sending_bux"
                ? "Approve $BUX transfer in your wallet…"
                : "Sending SOL payout from liquidity pool…"}
            </div>
          )}

          {step === "paying_sol" && cashoutError && buxTxSignature && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                Your $BUX transfer is on-chain. Retry the SOL payout — do not send $BUX again.
              </p>
              <button
                type="button"
                onClick={() => void handleRetryConfirm()}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3.5 text-sm font-semibold text-bg-deep"
              >
                <Wallet className="h-4 w-4" />
                Retry SOL payout
              </button>
            </div>
          )}
        </div>
      )}
    </CashoutShell>
  );
}

function FlowStep({
  active,
  done,
  step,
  icon: Icon,
  title,
  detail,
}: {
  active: boolean;
  done: boolean;
  step: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  detail: string;
}) {
  const badgeClass = done
    ? "bg-accent-green text-bg-deep"
    : active
      ? "bg-accent-purple text-white ring-2 ring-accent-purple/30"
      : "bg-border text-muted";

  return (
    <li className="flex gap-3 rounded-xl border border-border/50 bg-bg-deep/40 p-3.5">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
      >
        {done ? "✓" : step}
      </span>
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${active || done ? "text-accent-cyan" : "text-muted"}`}
          strokeWidth={2}
        />
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-muted">{detail}</p>
        </div>
      </div>
    </li>
  );
}

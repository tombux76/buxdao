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
import { CheckCircle2, Loader2 } from "lucide-react";
import { DiscordLoginButton } from "@/components/hub/ProfileConnectActions";
import { HubCashoutRules } from "@/components/hub/HubCashoutRules";
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
      setCompletedSolNet(confirmBody.solNet ?? prepareData.solNet);
      setStep("success");
      setPrepareData(null);
      const next = await refreshEligibility().catch(() => null);
      if (next) {
        setEligibility(next);
      }
    } catch (err) {
      setStep("ready");
      setCashoutError(err instanceof Error ? err.message : "Cashout failed");
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="tile-border space-y-4 rounded-xl bg-bg-deep/50 p-4 sm:p-5">
        <div>
          <p className="text-xs uppercase text-muted">{cashoutContent.title}</p>
          <p className="mt-1 text-sm text-muted">{cashoutContent.intro}</p>
        </div>
        <HubCashoutRules />
        <div className="space-y-3">
          <p className="text-sm text-muted">{cashoutContent.ctaLoggedOut}</p>
          <DiscordLoginButton fullWidth />
        </div>
      </div>
    );
  }

  return (
    <div className="tile-border space-y-4 rounded-xl bg-bg-deep/50 p-4 sm:p-5">
      <div>
        <p className="text-xs uppercase text-muted">{cashoutContent.title}</p>
        <p className="mt-1 text-sm text-muted">{cashoutContent.intro}</p>
      </div>

      <HubCashoutRules />

      {loading && <p className="text-sm text-muted">Loading cashout eligibility…</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {!connected && (
        <p className="text-sm text-muted">{cashoutContent.ctaNeedWallet}</p>
      )}
      {connected && !walletLinked && (
        <p className="text-sm text-amber-400">Link your connected wallet in Hub first.</p>
      )}

      {eligibility && walletLinked && step === "idle" && (
        <>
          {!eligibility.eligible && eligibility.reasons.length > 0 && (
            <ul className="space-y-1 text-sm text-amber-400">
              {eligibility.reasons.map((reason) => (
                <li key={reason}>• {reason}</li>
              ))}
            </ul>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-xs text-muted">Your fee</p>
              <p className="font-medium">
                {eligibility.feePercent}%
                {eligibility.hasBuxdao5 ? " (BUX$DAO 5)" : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Max per cashout</p>
              <p className="font-medium">{eligibility.maxSolNet} SOL net</p>
            </div>
            <div>
              <p className="text-xs text-muted">Cooldown</p>
              {eligibility.cooldownActive && eligibility.cooldownEndsAt ? (
                <p className="font-medium text-amber-400">
                  {eligibility.cooldownDaysRemaining} day
                  {eligibility.cooldownDaysRemaining === 1 ? "" : "s"} left ·{" "}
                  {formatCooldownDate(eligibility.cooldownEndsAt)}
                </p>
              ) : (
                <p className="font-medium text-accent-green">
                  Ready · {eligibility.cooldownDays}-day between cashouts
                </p>
              )}
            </div>
          </div>

          <label className="block">
            <span className="text-xs uppercase text-muted">$BUX amount</span>
            <input
              type="number"
              min={eligibility.minBux}
              max={eligibility.maxBuxCashout}
              value={amountBux}
              onChange={(e) => setAmountBux(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-bg-surface px-3 py-2 font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted">
              Balance: {formatBux(eligibility.buxBalance)} $BUX · max {formatBux(eligibility.maxBuxCashout)}
              {!eligibility.hasWhaleRole &&
                ` · whale role required above ${eligibility.whaleThresholdSol} SOL`}
            </p>
          </label>

          <button
            type="button"
            disabled={!eligibility.eligible || !amountValid}
            onClick={() => void handlePrepare()}
            className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cash out {amountValid ? formatBux(parsedAmount) : "—"} $BUX
          </button>
        </>
      )}

      {step === "success" && (
        <div className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />
            <div className="space-y-2 text-sm">
              <p className="font-medium text-accent-green">
                Received {formatSol(completedSolNet ?? 0)} SOL
              </p>
              {buxTxSignature && (
                <p>
                  $BUX sent:{" "}
                  <a
                    href={solscanTxUrl(buxTxSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-cyan hover:underline"
                  >
                    Solscan
                  </a>
                </p>
              )}
              {solTxSignature && (
                <p>
                  SOL received:{" "}
                  <a
                    href={solscanTxUrl(solTxSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-cyan hover:underline"
                  >
                    Solscan
                  </a>
                </p>
              )}
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
        <div className="space-y-4 rounded-xl border border-border bg-bg-deep/40 p-4">
          <div className="text-sm">
            <p className="font-medium">
              Cash out {formatBux(prepareData.amountBux)} $BUX → {formatSol(prepareData.solNet)} SOL
            </p>
            <p className="mt-1 text-xs text-muted">
              Fee {formatSol(prepareData.feeSol)} SOL ({prepareData.feePercent}%) · rate{" "}
              {formatSol(prepareData.tokenValue)} SOL per $BUX
            </p>
          </div>

          <ol className="space-y-3 text-sm">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-purple text-xs font-bold text-white">
                1
              </span>
              <div>
                <p className="font-medium">Send $BUX to liquidity wallet</p>
                <p className="text-xs text-muted">Approve the SPL transfer in your wallet.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border text-xs font-bold text-muted">
                2
              </span>
              <div>
                <p className="font-medium">Receive SOL</p>
                <p className="text-xs text-muted">Paid automatically after $BUX is confirmed.</p>
              </div>
            </li>
          </ol>

          {cashoutError && <p className="text-sm text-red-400">{cashoutError}</p>}

          {step === "ready" && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleSendBux()}
                className="flex-1 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep"
              >
                Send $BUX & cash out
              </button>
              <button
                type="button"
                onClick={() => void resetFlow()}
                className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:border-border-strong"
              >
                Cancel
              </button>
            </div>
          )}

          {(step === "sending_bux" || step === "paying_sol") && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin" />
              {step === "sending_bux" ? "Approve $BUX transfer in your wallet…" : "Sending SOL payout…"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

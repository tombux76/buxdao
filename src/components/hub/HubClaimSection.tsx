"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";

type ClaimRewardState = {
  unclaimedBalanceBux: number;
  totalClaimedBux: number;
  claimFeeSol: number;
  treasuryWallet: string;
  todayEngagement: {
    rewardDateEt: string;
    messagesCount: number;
    reactionsCount: number;
    messagesBux: number;
    reactionsBux: number;
    totalEngagementBux: number;
  };
};

type PrepareClaimResult = {
  treasuryWallet: string;
  payoutWallet: string;
  amountRaw: string;
  amountBux: number;
  feeLamports: number;
  feeSol: number;
  resumed: boolean;
};

type ClaimStep = "idle" | "ready" | "paying_fee" | "sending_bux" | "success";

function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function solscanTxUrl(signature: string): string {
  return `https://solscan.io/tx/${signature}`;
}

export function HubClaimSection() {
  const { data: session, status } = useSession();
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const { wallets } = useLinkedWallets();

  const [state, setState] = useState<ClaimRewardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [claimStep, setClaimStep] = useState<ClaimStep>("idle");
  const [prepareData, setPrepareData] = useState<PrepareClaimResult | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [feeTxSignature, setFeeTxSignature] = useState<string | null>(null);
  const [buxTxSignature, setBuxTxSignature] = useState<string | null>(null);
  const [claimedAmountBux, setClaimedAmountBux] = useState<number | null>(null);

  const isAuthenticated = status === "authenticated" && !!session?.user;
  const walletAddress = publicKey?.toBase58() ?? "";
  const linkedAddresses = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);
  const walletLinked = connected && walletAddress ? linkedAddresses.has(walletAddress) : false;

  const refreshState = useCallback(async () => {
    const res = await fetch("/api/holder-rewards/state");
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load claim balance");
    }
    return res.json() as Promise<ClaimRewardState>;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      setState(null);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    refreshState()
      .then(setState)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isAuthenticated, refreshState]);

  const canStartClaim =
    isAuthenticated &&
    walletLinked &&
    (state?.unclaimedBalanceBux ?? 0) > 0 &&
    claimStep === "idle";

  async function handleStartClaim() {
    if (!walletAddress || !sendTransaction) {
      setClaimError("Connect a linked wallet to claim.");
      return;
    }

    setClaimError(null);
    setFeeTxSignature(null);
    setBuxTxSignature(null);
    setClaimedAmountBux(null);

    try {
      const prepareRes = await fetch("/api/holder-rewards/claim/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutWallet: walletAddress }),
      });
      const prepareBody = (await prepareRes.json()) as PrepareClaimResult & { error?: string };
      if (!prepareRes.ok) {
        throw new Error(prepareBody.error ?? "Failed to prepare claim");
      }

      setPrepareData(prepareBody);
      setClaimStep("ready");
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Failed to start claim");
    }
  }

  async function handlePayFee() {
    if (!prepareData || !walletAddress || !sendTransaction) {
      return;
    }

    setClaimStep("paying_fee");
    setClaimError(null);

    try {
      const treasury = new PublicKey(prepareData.treasuryWallet);
      const from = new PublicKey(walletAddress);

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: treasury,
          lamports: prepareData.feeLamports,
        }),
      );

      const signature = await sendTransaction(transaction, connection);
      setFeeTxSignature(signature);
      await connection.confirmTransaction(signature, "confirmed");

      setClaimStep("sending_bux");
      await confirmClaim(signature);
    } catch (err) {
      setClaimStep("ready");
      setClaimError(err instanceof Error ? err.message : "Fee payment failed");
    }
  }

  async function confirmClaim(signature: string) {
    if (!walletAddress) {
      return;
    }

    let confirmed = false;
    let retries = 5;
    let waitMs = 2000;
    let lastError = "Failed to complete claim";

    while (retries > 0 && !confirmed) {
      const confirmRes = await fetch("/api/holder-rewards/claim/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutWallet: walletAddress, feeSignature: signature }),
      });

      const confirmBody = (await confirmRes.json()) as {
        error?: string;
        amountBux?: number;
        buxTxSignature?: string;
        feeTxSignature?: string;
      };

      if (confirmRes.ok) {
        setClaimedAmountBux(confirmBody.amountBux ?? prepareData?.amountBux ?? 0);
        setBuxTxSignature(confirmBody.buxTxSignature ?? null);
        setFeeTxSignature(confirmBody.feeTxSignature ?? signature);
        confirmed = true;
        break;
      }

      lastError = confirmBody.error ?? lastError;
      if (confirmRes.status === 202) {
        await new Promise((r) => setTimeout(r, waitMs));
        waitMs = Math.floor(waitMs * 1.5);
        retries -= 1;
        continue;
      }
      throw new Error(lastError);
    }

    if (!confirmed) {
      throw new Error(
        "Fee received but $BUX payout is still processing. Refresh in a moment — your fee is recorded.",
      );
    }

    setClaimStep("success");
    setPrepareData(null);
    const nextState = await refreshState();
    setState(nextState);
  }

  function resetClaimFlow() {
    setClaimStep("idle");
    setPrepareData(null);
    setClaimError(null);
    setFeeTxSignature(null);
    setBuxTxSignature(null);
    setClaimedAmountBux(null);
  }

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

          {claimStep === "success" && (
            <div className="rounded-xl border border-accent-green/30 bg-accent-green/10 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-green" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-accent-green">
                    Claimed {formatBux(claimedAmountBux ?? 0)} $BUX to your wallet
                  </p>
                  {feeTxSignature && (
                    <p>
                      Step 1 (your fee):{" "}
                      <a
                        href={solscanTxUrl(feeTxSignature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-cyan hover:underline"
                      >
                        View on Solscan
                      </a>
                    </p>
                  )}
                  {buxTxSignature && (
                    <p>
                      Step 2 ($BUX payout):{" "}
                      <a
                        href={solscanTxUrl(buxTxSignature)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent-cyan hover:underline"
                      >
                        View on Solscan
                      </a>
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={resetClaimFlow}
                    className="mt-2 text-xs text-muted underline hover:text-foreground"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {claimStep !== "success" && (
            <>
              {!connected && (
                <p className="text-sm text-muted">
                  Connect a wallet linked in your Hub profile to claim rewards.
                </p>
              )}
              {connected && !walletLinked && (
                <p className="text-sm text-amber-400">
                  Your connected wallet is not linked. Link it in your Hub profile first.
                </p>
              )}

              {claimStep === "idle" && (
                <button
                  type="button"
                  disabled={!canStartClaim}
                  onClick={() => void handleStartClaim()}
                  className="w-full rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Claim $BUX
                </button>
              )}

              {(claimStep === "ready" ||
                claimStep === "paying_fee" ||
                claimStep === "sending_bux") &&
                prepareData && (
                  <div className="space-y-4 rounded-xl border border-border bg-bg-deep/40 p-4">
                    <div>
                      <p className="text-sm font-medium">Two-step claim</p>
                    </div>

                    <ol className="space-y-3 text-sm">
                      <li className="flex gap-3">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            claimStep === "paying_fee" || claimStep === "sending_bux"
                              ? "bg-accent-green text-bg-deep"
                              : "bg-accent-purple text-white"
                          }`}
                        >
                          {claimStep === "sending_bux" ? "✓" : "1"}
                        </span>
                        <div>
                          <p className="font-medium">You pay the claim fee</p>
                          <p className="text-xs text-muted">
                            Send exactly{" "}
                            <span className="font-mono text-foreground">{prepareData.feeSol} SOL</span> to{" "}
                            <span className="font-mono text-foreground">
                              {truncateAddress(prepareData.treasuryWallet)}
                            </span>
                            . You&apos;ll approve this in your wallet.
                          </p>
                        </div>
                      </li>
                      <li className="flex gap-3">
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            claimStep === "sending_bux"
                              ? "bg-accent-purple text-white"
                              : "bg-border text-muted"
                          }`}
                        >
                          2
                        </span>
                        <div>
                          <p className="font-medium">Treasury sends your $BUX</p>
                          <p className="text-xs text-muted">
                            Once the fee is confirmed, we transfer{" "}
                            <span className="font-mono text-accent-gold">
                              {formatBux(prepareData.amountBux)} $BUX
                            </span>{" "}
                            to{" "}
                            <span className="font-mono text-foreground">
                              {truncateAddress(prepareData.payoutWallet)}
                            </span>
                            . You don&apos;t sign this step.
                          </p>
                        </div>
                      </li>
                    </ol>

                    {claimError && <p className="text-sm text-red-400">{claimError}</p>}

                    {claimStep === "ready" && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePayFee()}
                          className="flex-1 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep"
                        >
                          Pay {prepareData.feeSol} SOL &amp; continue
                        </button>
                        <button
                          type="button"
                          onClick={resetClaimFlow}
                          className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:border-border-strong"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {claimStep === "paying_fee" && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Waiting for wallet approval and fee confirmation…
                      </div>
                    )}

                    {claimStep === "sending_bux" && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Fee confirmed — sending {formatBux(prepareData.amountBux)} $BUX from treasury…
                      </div>
                    )}
                  </div>
                )}
            </>
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { CheckCircle2, Loader2 } from "lucide-react";
import { DiscordLoginButton } from "@/components/hub/ProfileConnectActions";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";
import { getLatestBlockhashForWallet } from "@/lib/solana/browser-rpc";
import { discordEngagement } from "@/content/site";

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
  feePaid: boolean;
  feeTxSignature: string | null;
};

type ClaimStep = "idle" | "ready" | "paying_fee" | "sending_bux" | "success";

function formatBux(value: number): string {
  return Math.floor(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
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
  const confirmingRef = useRef(false);

  const isAuthenticated = status === "authenticated" && !!session?.user;
  const walletAddress = publicKey?.toBase58() ?? "";
  const linkedAddresses = useMemo(() => new Set(wallets.map((w) => w.address)), [wallets]);
  const walletLinked = connected && walletAddress ? linkedAddresses.has(walletAddress) : false;
  const feeAlreadyPaid = Boolean(prepareData?.feePaid || feeTxSignature);

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

  const confirmClaim = useCallback(
    async (signature: string) => {
      if (!walletAddress) {
        return;
      }

      if (confirmingRef.current) {
        return;
      }
      confirmingRef.current = true;

      try {
        let confirmed = false;
        let retries = 8;
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
          throw new Error("Payout still processing. Wait a moment and tap Complete claim again.");
        }

        setClaimStep("success");
        setPrepareData(null);
        setClaimError(null);
        const nextState = await refreshState();
        setState(nextState);
      } finally {
        confirmingRef.current = false;
      }
    },
    [walletAddress, prepareData?.amountBux, refreshState],
  );

  useEffect(() => {
    if (claimStep !== "sending_bux" || !feeTxSignature) {
      return;
    }
    void confirmClaim(feeTxSignature).catch((err: Error) => {
      setClaimError(err.message);
    });
  }, [claimStep, feeTxSignature, confirmClaim]);

  const canStartClaim =
    isAuthenticated &&
    walletLinked &&
    (state?.unclaimedBalanceBux ?? 0) > 0 &&
    claimStep === "idle";

  async function applyPrepareResult(prepareBody: PrepareClaimResult) {
    setPrepareData(prepareBody);

    if (prepareBody.feePaid && prepareBody.feeTxSignature) {
      setFeeTxSignature(prepareBody.feeTxSignature);
      setClaimStep("sending_bux");
      return;
    }

    setClaimStep("ready");
  }

  async function handleStartClaim() {
    if (!walletAddress || !sendTransaction) {
      setClaimError("Connect a linked wallet to claim.");
      return;
    }

    setClaimError(null);
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

      if (!prepareBody.feePaid) {
        setFeeTxSignature(null);
      }

      await applyPrepareResult(prepareBody);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Failed to start claim");
    }
  }

  async function handlePayFee() {
    if (!prepareData || !walletAddress || !sendTransaction || feeAlreadyPaid) {
      return;
    }

    setClaimStep("paying_fee");
    setClaimError(null);

    try {
      const treasury = new PublicKey(prepareData.treasuryWallet);
      const from = new PublicKey(walletAddress);
      const blockhash = await getLatestBlockhashForWallet();

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: from,
          toPubkey: treasury,
          lamports: prepareData.feeLamports,
        }),
      );
      transaction.recentBlockhash = blockhash;

      const signature = await sendTransaction(transaction, connection);
      await fetch("/api/holder-rewards/claim/record-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutWallet: walletAddress, feeSignature: signature }),
      });
      setFeeTxSignature(signature);
      setClaimStep("sending_bux");
    } catch (err) {
      setClaimStep("ready");
      setClaimError(err instanceof Error ? err.message : "Fee payment failed");
    }
  }

  async function handleCompleteClaim() {
    if (!feeTxSignature) {
      return;
    }
    setClaimError(null);
    setClaimStep("sending_bux");
    try {
      await confirmClaim(feeTxSignature);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Could not complete claim");
    }
  }

  async function resetClaimFlow() {
    if (prepareData && !feeAlreadyPaid) {
      await fetch("/api/holder-rewards/claim/cancel", { method: "POST" }).catch(() => null);
    }
    setClaimStep("idle");
    setPrepareData(null);
    setClaimError(null);
    setFeeTxSignature(null);
    setBuxTxSignature(null);
    setClaimedAmountBux(null);
  }

  if (!isAuthenticated) {
    return (
      <div className="tile-border space-y-4 rounded-xl bg-bg-deep/50 p-4 sm:p-5">
        <div>
          <p className="text-xs uppercase text-muted">Claim rewards</p>
          <p className="mt-1 text-sm text-muted">{discordEngagement.intro}</p>
        </div>
        <div className="rounded-xl border border-border/80 bg-bg-deep/30 p-4 text-sm text-muted">
          <p className="font-medium text-foreground">{discordEngagement.eligibility.title}</p>
          <ul className="mt-2 space-y-1.5">
            {discordEngagement.eligibility.items.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-accent-purple">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
        <DiscordLoginButton fullWidth />
      </div>
    );
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
                      Fee:{" "}
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
                      $BUX payout:{" "}
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
                    onClick={() => void resetClaimFlow()}
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
                  Claim {formatBux(state.unclaimedBalanceBux)} $BUX
                </button>
              )}

              {(claimStep === "ready" ||
                claimStep === "paying_fee" ||
                claimStep === "sending_bux") &&
                prepareData && (
                  <div className="space-y-4 rounded-xl border border-border bg-bg-deep/40 p-4">
                    <div>
                      <p className="text-sm font-medium">
                        Claiming {formatBux(prepareData.amountBux)} $BUX
                      </p>
                    </div>

                    {!feeAlreadyPaid && (
                      <ol className="space-y-3 text-sm">
                        <li className="flex gap-3">
                          <span
                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                              claimStep === "paying_fee" || claimStep === "sending_bux"
                                ? "bg-accent-green text-bg-deep"
                                : "bg-accent-purple text-white"
                            }`}
                          >
                            1
                          </span>
                          <div>
                            <p className="font-medium">Pay claim fee</p>
                            <p className="text-xs text-muted">
                              {prepareData.feeSol} SOL to{" "}
                              {truncateAddress(prepareData.treasuryWallet)} — one-time wallet approval.
                            </p>
                          </div>
                        </li>
                        <li className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-border text-xs font-bold text-muted">
                            2
                          </span>
                          <div>
                            <p className="font-medium">Receive $BUX</p>
                            <p className="text-xs text-muted">
                              Treasury sends {formatBux(prepareData.amountBux)} $BUX to your wallet.
                            </p>
                          </div>
                        </li>
                      </ol>
                    )}

                    {feeAlreadyPaid && (
                      <p className="text-sm text-muted">
                        Fee paid. Sending {formatBux(prepareData.amountBux)} $BUX from treasury — no
                        further wallet approval needed.
                      </p>
                    )}

                    {claimError && <p className="text-sm text-red-400">{claimError}</p>}

                    {claimStep === "ready" && !feeAlreadyPaid && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handlePayFee()}
                          className="flex-1 rounded-xl bg-gradient-to-r from-accent-purple to-accent-cyan py-3 text-sm font-semibold text-bg-deep"
                        >
                          Pay {prepareData.feeSol} SOL
                        </button>
                        <button
                          type="button"
                          onClick={() => void resetClaimFlow()}
                          className="rounded-xl border border-border px-4 py-3 text-sm text-muted hover:border-border-strong"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    {claimStep === "paying_fee" && (
                      <div className="flex items-center gap-2 text-sm text-muted">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Approve the fee in your wallet…
                      </div>
                    )}

                    {claimStep === "sending_bux" && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Sending {formatBux(prepareData.amountBux)} $BUX…
                        </div>
                        {claimError && (
                          <button
                            type="button"
                            onClick={() => void handleCompleteClaim()}
                            className="w-full rounded-xl border border-accent-gold/40 py-3 text-sm font-semibold text-accent-gold hover:border-accent-gold"
                          >
                            Complete claim (no wallet needed)
                          </button>
                        )}
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

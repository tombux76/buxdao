"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  CheckCircle2,
  ExternalLink,
  Gift,
  Loader2,
  Trophy,
  Wallet,
  XCircle,
} from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import {
  DiscordLoginButton,
  HubWalletButton,
} from "@/components/hub/ProfileConnectActions";
import { getLatestBlockhashForWallet } from "@/lib/solana/browser-rpc";
import { prizeDrawContent, site } from "@/content/site";

type Checklist = {
  discordConnected: boolean;
  walletConnected: boolean;
  holderVerified: boolean;
  payoutWallet: string | null;
  eligible: boolean;
};

type WinnerRow = {
  id: number;
  winnerDiscordUsername: string | null;
  winnerDiscordImage: string | null;
  payoutWallet: string;
  prizeAmount: number;
  prizeUsdValue: number | null;
  txSignature: string;
  eligiblePoolSize: number;
  createdAt: string;
};

type StatusResponse = {
  prizeAmount: number;
  prizeUsdValue: number | null;
  empireUsdPrice: number | null;
  tokenImageUrl: string | null;
  eligiblePoolSize: number;
  prizeWallet: string;
  pastWinners: WinnerRow[];
  checklist: Checklist | null;
  error?: string;
};

type PrepareResult = {
  mint: string;
  prizeWallet: string;
  amountRaw: string;
  prizeAmount: number;
  eligiblePoolSize: number;
  winner: {
    discordUsername: string;
    discordImage: string | null;
    payoutWallet: string;
  };
  error?: string;
};

type DrawStep = "idle" | "sending" | "confirming";

const EMPIRE_IMAGE = "/brand/empire.png";

function formatUsd(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function shortWallet(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function StatusIcon({ done }: { done: boolean }) {
  if (done) {
    return <CheckCircle2 className="h-5 w-5 text-accent-green" strokeWidth={2.25} />;
  }
  return <XCircle className="h-5 w-5 text-red-400" strokeWidth={2.25} />;
}

export function PrizeDrawPage() {
  const { publicKey, connected, sendTransaction } = useWallet();
  const { connection } = useConnection();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawStep, setDrawStep] = useState<DrawStep>("idle");
  const [runResult, setRunResult] = useState<string | null>(null);

  const walletAddress = publicKey?.toBase58() ?? "";
  const running = drawStep !== "idle";

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/empire-draw/status");
      const body = (await response.json()) as StatusResponse & { error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Failed to load prize draw");
      }
      setStatus(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prize draw");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function handleRunDraw() {
    if (!sendTransaction || !walletAddress) {
      setError("Connect the prize wallet first");
      return;
    }
    if (
      !window.confirm(
        "Run the weekly EMPIRE prize draw now? A random eligible holder will be selected and you'll sign a 50,000 EMPIRE transfer from the prize wallet.",
      )
    ) {
      return;
    }

    setRunResult(null);
    setError(null);
    setDrawStep("sending");

    try {
      const prepareRes = await fetch("/api/empire-draw/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const prepare = (await prepareRes.json()) as PrepareResult;
      if (!prepareRes.ok) {
        throw new Error(prepare.error ?? "Failed to prepare draw");
      }

      const mint = new PublicKey(prepare.mint);
      const owner = new PublicKey(walletAddress);
      const recipient = new PublicKey(prepare.winner.payoutWallet);
      const amountRaw = BigInt(prepare.amountRaw);

      const fromAta = await getAssociatedTokenAddress(mint, owner);
      const toAta = await getAssociatedTokenAddress(mint, recipient);

      const transaction = new Transaction();
      const destInfo = await connection.getAccountInfo(toAta);
      if (!destInfo) {
        transaction.add(createAssociatedTokenAccountInstruction(owner, toAta, recipient, mint));
      }
      transaction.add(createTransferInstruction(fromAta, toAta, owner, amountRaw));

      const blockhash = await getLatestBlockhashForWallet();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = owner;

      const signature = await sendTransaction(transaction, connection);

      setDrawStep("confirming");

      const confirmRes = await fetch("/api/empire-draw/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, txSignature: signature }),
      });
      const confirm = (await confirmRes.json()) as {
        error?: string;
        winner?: { discordUsername: string };
        txSignature?: string;
      };
      if (!confirmRes.ok) {
        throw new Error(confirm.error ?? "Failed to confirm draw");
      }

      setRunResult(
        `Winner: ${confirm.winner?.discordUsername ?? prepare.winner.discordUsername} · tx ${
          confirm.txSignature?.slice(0, 8) ?? signature.slice(0, 8)
        }…`,
      );
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Draw failed");
    } finally {
      setDrawStep("idle");
    }
  }

  const content = prizeDrawContent;
  const checklist = status?.checklist ?? null;
  const lastWinner = status?.pastWinners?.[0] ?? null;

  const step1Done = Boolean(checklist?.discordConnected);
  const step2Done = Boolean(checklist?.walletConnected);
  const step3Done = Boolean(checklist?.holderVerified);
  const eligible = Boolean(checklist?.eligible);

  const isPrizeWalletConnected =
    connected && Boolean(status?.prizeWallet) && walletAddress === status?.prizeWallet;

  return (
    <div className="space-y-10">
      <SectionHeader eyebrow="Community" title={content.title} description={content.subtitle} />

      <Card className="p-6">
        <p className="text-sm leading-relaxed text-muted">{content.intro}</p>
      </Card>

      <Card glow="gold" className="flex items-start gap-4 border-l-2 border-l-accent-gold p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-gold/15 ring-1 ring-accent-gold/40">
          <Gift className="h-6 w-6 text-accent-gold" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-accent-gold">{content.noClaimTitle}</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">{content.noClaimBody}</p>
        </div>
      </Card>

      {error && (
        <Card className="border-l-2 border-l-red-500/70 p-4 text-sm text-red-300">{error}</Card>
      )}

      {runResult && (
        <Card className="border-l-2 border-l-accent-green p-4 text-sm text-accent-green">{runResult}</Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Prize + eligible pool */}
        <Card glow="gold" className="space-y-5 p-6">
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={EMPIRE_IMAGE}
              alt="EMPIRE"
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-accent-gold/40"
            />
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{content.prizeLabel}</p>
              <p className="text-3xl font-bold text-foreground">
                {formatNumber(status?.prizeAmount ?? 50_000)} EMPIRE
              </p>
              <p className="mt-1 text-lg text-accent-gold">
                {formatUsd(status?.prizeUsdValue ?? null)}
                {status?.empireUsdPrice != null && (
                  <span className="ml-2 text-sm text-muted">@ ${status.empireUsdPrice.toFixed(6)}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between rounded-xl border border-border/70 bg-bg-surface/40 p-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted">{content.poolLabel}</p>
              <p className="mt-1 text-3xl font-bold text-accent-cyan">
                {loading ? "…" : formatNumber(status?.eligiblePoolSize ?? 0)}
              </p>
            </div>
            <p className="max-w-[55%] text-right text-xs text-muted">
              Unique verified holders — one entry each
            </p>
          </div>
        </Card>

        {/* Last winner */}
        <Card className="flex flex-col p-6">
          <p className="text-xs uppercase tracking-wider text-muted">{content.lastWinnerLabel}</p>
          {loading ? (
            <div className="flex flex-1 items-center gap-2 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading…
            </div>
          ) : lastWinner ? (
            <div className="mt-4 flex items-center gap-4">
              {lastWinner.winnerDiscordImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={lastWinner.winnerDiscordImage}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-accent-purple/40"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-purple/15 ring-2 ring-accent-purple/40">
                  <Trophy className="h-7 w-7 text-accent-gold" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-foreground">
                  {lastWinner.winnerDiscordUsername ?? shortWallet(lastWinner.payoutWallet)}
                </p>
                <p className="text-accent-gold">{formatNumber(lastWinner.prizeAmount)} EMPIRE</p>
                <p className="mt-1 text-xs text-muted">Won {formatDate(lastWinner.createdAt)}</p>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center justify-center gap-2 py-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/5">
                <Trophy className="h-7 w-7 text-muted" />
              </div>
              <p className="text-sm text-muted">No winners yet — first draw coming soon.</p>
            </div>
          )}
        </Card>
      </div>

      {/* Checklist */}
      <section>
        <SectionHeader eyebrow="Eligibility" title={content.checklistTitle} />

        <Card
          className={`mb-4 flex items-center gap-3 border-l-2 p-4 text-sm ${
            eligible
              ? "border-l-accent-green text-accent-green"
              : "border-l-amber-400/70 text-amber-300"
          }`}
        >
          {eligible ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" strokeWidth={2.25} />
          ) : (
            <XCircle className="h-5 w-5 shrink-0" strokeWidth={2.25} />
          )}
          <span>
            {eligible
              ? `You're entered in this week's draw${
                  checklist?.payoutWallet ? ` — payout to ${shortWallet(checklist.payoutWallet)}` : ""
                }.`
              : "You're not yet eligible. Complete every step below to enter."}
          </span>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {content.steps.map((step) => {
            const done =
              step.step === 1 ? step1Done : step.step === 2 ? step2Done : step3Done;

            return (
              <Card key={step.step} className="flex flex-col p-5">
                <div className="mb-4 flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                    {step.step === 2 ? (
                      <Wallet className="h-5 w-5 text-white" />
                    ) : step.step === 3 ? (
                      <Trophy className="h-5 w-5 text-accent-gold" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/brand/discord.svg" alt="" className="h-8 w-8" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2">
                      <StatusIcon done={done} />
                      <h3 className="font-semibold">{step.title}</h3>
                    </div>
                    <p className="text-sm text-muted">{step.body}</p>
                  </div>
                </div>

                {step.step === 1 && !step1Done && <DiscordLoginButton fullWidth />}
                {step.step === 2 && step1Done && !step2Done && <HubWalletButton fullWidth />}
                {step.step === 3 && step2Done && !step3Done && (
                  <a
                    href={site.social.discord}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-accent-gold/40 bg-accent-gold/10 px-4 py-2.5 text-sm font-semibold text-accent-gold hover:bg-accent-gold/20"
                  >
                    Verify in Discord
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      {/* Past winners */}
      <section>
        <SectionHeader eyebrow="History" title={content.winnersTitle} />
        <Card className="overflow-hidden p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-8 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading winners…
            </div>
          ) : (status?.pastWinners.length ?? 0) === 0 ? (
            <p className="p-6 text-sm text-muted">No winners yet — first draw coming soon.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-bg-surface/50 text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Winner</th>
                    <th className="px-4 py-3 font-medium">Prize</th>
                    <th className="px-4 py-3 font-medium">Pool</th>
                    <th className="px-4 py-3 font-medium">Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {status?.pastWinners.map((winner) => (
                    <tr key={winner.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 text-muted">{formatDate(winner.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {winner.winnerDiscordImage && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={winner.winnerDiscordImage}
                              alt=""
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          )}
                          <span className="font-medium">
                            {winner.winnerDiscordUsername ?? shortWallet(winner.payoutWallet)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {formatNumber(winner.prizeAmount)} EMPIRE
                        {winner.prizeUsdValue != null && (
                          <span className="ml-1 text-muted">({formatUsd(winner.prizeUsdValue)})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{winner.eligiblePoolSize}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`https://solscan.io/tx/${winner.txSignature}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent-cyan hover:underline"
                        >
                          {winner.txSignature.slice(0, 8)}…
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {isPrizeWalletConnected && (
        <Card className="border border-accent-purple/30 p-5">
          <h3 className="font-semibold">Run draw</h3>
          <p className="mt-1 text-sm text-muted">
            Picks one random eligible holder, then asks you to sign a 50,000 EMPIRE transfer from the
            connected prize wallet. The winner is recorded and announced in Discord once the transfer
            confirms on-chain.
          </p>
          <button
            type="button"
            onClick={() => void handleRunDraw()}
            disabled={running}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-accent-purple px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-purple/90 disabled:opacity-50"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
            {drawStep === "sending"
              ? "Approve transfer in wallet…"
              : drawStep === "confirming"
                ? "Confirming on-chain…"
                : "Run draw"}
          </button>
        </Card>
      )}
    </div>
  );
}

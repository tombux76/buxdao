"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Coins, Gift, Wallet } from "lucide-react";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import { collectionConfigs } from "@/content/site";
import { useHolderRewards } from "@/hooks/useHolderRewards";

function formatBux(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function RewardsDashboard() {
  const { data: session, status: authStatus } = useSession();
  const { publicKey, connected, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { state, loading, error, refresh } = useHolderRewards();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);

  const discordReady = authStatus === "authenticated" && !!session?.user;
  const walletAddress = publicKey?.toBase58() ?? "";
  const walletLinked = Boolean(
    walletAddress && state?.linkedWallets.includes(walletAddress),
  );
  const canClaim =
    discordReady &&
    connected &&
    walletLinked &&
    (state?.unclaimedBalanceBux ?? 0) > 0 &&
    !claiming;

  async function handleClaim() {
    if (!walletAddress || !signTransaction) {
      setClaimError("Connect a linked wallet to claim.");
      return;
    }

    setClaiming(true);
    setClaimError(null);
    setClaimSuccess(null);

    try {
      const prepareRes = await fetch("/api/holder-rewards/claim/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutWallet: walletAddress }),
      });
      const prepareData = (await prepareRes.json()) as {
        error?: string;
        transaction?: string;
        amountBux?: number;
      };
      if (!prepareRes.ok) {
        throw new Error(prepareData.error ?? "Failed to prepare claim");
      }
      if (!prepareData.transaction) {
        throw new Error("Missing transaction from server");
      }

      const tx = Transaction.from(Buffer.from(prepareData.transaction, "base64"));
      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });

      await connection.confirmTransaction(signature, "confirmed");

      let confirmed = false;
      let retries = 3;
      let waitMs = 2000;
      while (retries > 0 && !confirmed) {
        const confirmRes = await fetch("/api/holder-rewards/claim/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payoutWallet: walletAddress, signature }),
        });
        if (confirmRes.ok) {
          confirmed = true;
          break;
        }
        const confirmData = (await confirmRes.json()) as { error?: string };
        if (confirmRes.status === 202) {
          await new Promise((r) => setTimeout(r, waitMs));
          waitMs = Math.floor(waitMs * 1.5);
          retries -= 1;
          continue;
        }
        throw new Error(confirmData.error ?? "Failed to confirm claim");
      }

      if (!confirmed) {
        throw new Error("Claim sent but confirmation timed out. Refresh in a moment.");
      }

      setClaimSuccess(
        `Claimed ${formatBux(prepareData.amountBux ?? 0)} $BUX. View on Solscan: https://solscan.io/tx/${signature}`,
      );
      await refresh();
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : "Claim failed");
    } finally {
      setClaiming(false);
    }
  }

  if (!discordReady) {
    return (
      <div className="tile-border rounded-xl bg-bg-deep/50 p-6 text-center">
        <p className="text-sm text-muted">Sign in with Discord on the Holder Hub to view daily rewards.</p>
        <a href="/hub" className="mt-4 inline-block text-sm text-accent-cyan hover:underline">
          Go to Holder Hub →
        </a>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="tile-border rounded-xl bg-bg-deep/50 p-6">
        <p className="text-sm text-muted">Loading rewards…</p>
      </div>
    );
  }

  if (error && !state) {
    return (
      <div className="tile-border rounded-xl bg-bg-deep/50 p-6">
        <p className="text-sm text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="tile-border rounded-xl bg-bg-deep/50 p-5">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted">
            <Gift className="h-4 w-4 text-accent-gold" />
            Unclaimed
          </div>
          <p className="font-mono text-3xl text-accent-gold">
            {formatBux(state?.unclaimedBalanceBux ?? 0)} <span className="text-lg">$BUX</span>
          </p>
        </div>
        <div className="tile-border rounded-xl bg-bg-deep/50 p-5">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase text-muted">
            <Coins className="h-4 w-4 text-accent-cyan" />
            Total claimed
          </div>
          <p className="font-mono text-3xl">
            {formatBux(state?.totalClaimedBux ?? 0)} <span className="text-lg text-muted">$BUX</span>
          </p>
        </div>
      </div>

      <div className="tile-border rounded-xl bg-bg-deep/50 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Wallet className="h-4 w-4 text-accent-purple" />
            Claim to connected wallet
          </div>
          <WalletConnectButton className="rounded-lg border border-border px-3 py-1.5 text-xs hover:border-border-strong" />
        </div>

        {!connected && (
          <p className="text-sm text-muted">Connect a wallet linked in your Hub to claim rewards.</p>
        )}
        {connected && !walletLinked && (
          <p className="text-sm text-amber-400">
            Connected wallet is not linked. Link it on the{" "}
            <a href="/hub" className="underline">
              Holder Hub
            </a>{" "}
            first.
          </p>
        )}
        {connected && walletLinked && (
          <p className="mb-4 break-all text-xs text-muted">
            Payout: {walletAddress}
            <br />
            Platform fee: {state?.claimFeeSol ?? 0.0005} SOL per claim
          </p>
        )}

        {claimError && <p className="mb-3 text-sm text-red-400">{claimError}</p>}
        {claimSuccess && (
          <p className="mb-3 text-sm text-accent-green">
            {claimSuccess}
          </p>
        )}

        <button
          type="button"
          disabled={!canClaim}
          onClick={() => void handleClaim()}
          className="rounded-xl bg-accent-purple px-4 py-2.5 text-sm font-semibold text-white transition enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {claiming ? "Claiming…" : "Claim $BUX"}
        </button>
      </div>

      <div className="tile-border rounded-xl bg-bg-deep/50 p-5">
        <h3 className="mb-3 text-sm font-semibold">Daily yields (wallet-held NFTs)</h3>
        <ul className="space-y-1 text-sm text-muted">
          {collectionConfigs.map((c) => (
            <li key={c.id}>
              {c.name}: <span className="font-mono text-foreground">{c.dailyBuxYield} $BUX</span> / day
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Bonuses: branded Fcked Catz merch traits 2×, top-10 ranked MM / MM3D 4×, loyalty up to 3×
          (30-day steps, resets on marketplace listing). GraveStake staked NFTs do not count — only
          wallet-held NFTs in Hub-linked wallets accrue.
        </p>
      </div>

      {state && state.recentAccruals.length > 0 && (
        <div className="tile-border rounded-xl bg-bg-deep/50 p-5">
          <h3 className="mb-3 text-sm font-semibold">Recent accruals</h3>
          <ul className="space-y-2 text-sm">
            {state.recentAccruals.map((row) => (
              <li key={row.rewardDateEt} className="flex justify-between text-muted">
                <span>{row.rewardDateEt}</span>
                <span className="font-mono text-foreground">
                  +{formatBux(row.amountBux)} $BUX ({row.nftCount} NFTs)
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

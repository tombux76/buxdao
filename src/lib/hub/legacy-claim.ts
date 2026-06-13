import { PublicKey } from "@solana/web3.js";
import { getPool } from "@/lib/db";
import {
  getLegacyAirdropByWallet,
  type LegacyAirdropEntry,
} from "@/lib/hub/legacy-airdrop-list";
import {
  beginLegacyClaim,
  finishLegacyClaimProcessing,
  getLegacyClaimRecord,
  isLegacyClaimProcessing,
  saveLegacyClaimRecord,
  type LegacyClaimRecord,
} from "@/lib/hub/legacy-claims-file";
import { sendLegacyAirdropBuxTransfer } from "@/lib/solana/treasury";

export type LegacyClaimStatus = "none" | "pending" | "processing" | "claimed";

export type LegacyClaimState = {
  status: LegacyClaimStatus;
  amountBux: number;
  walletAddress: string | null;
  txSignature: string | null;
  claimedAt: string | null;
  message: string | null;
};

function normalizeWallet(address: string): string {
  return new PublicKey(address).toBase58();
}

async function getLinkedWalletAddresses(userId: string): Promise<string[]> {
  const result = await getPool().query<{ wallet_address: string }>(
    `SELECT wallet_address FROM user_wallets WHERE user_id = $1 ORDER BY is_primary DESC, linked_at ASC`,
    [userId],
  );
  return result.rows.map((row) => row.wallet_address);
}

function findEligibleEntry(linkedWallets: string[]): LegacyAirdropEntry | undefined {
  for (const wallet of linkedWallets) {
    const entry = getLegacyAirdropByWallet(wallet);
    if (entry && entry.unclaimedAmount > 0) {
      return entry;
    }
  }
  return undefined;
}

function mapToState(
  entry: LegacyAirdropEntry | undefined,
  claim: LegacyClaimRecord | undefined,
): LegacyClaimState {
  if (!entry || entry.unclaimedAmount <= 0) {
    return {
      status: "none",
      amountBux: 0,
      walletAddress: null,
      txSignature: null,
      claimedAt: null,
      message: null,
    };
  }

  if (claim) {
    return {
      status: "claimed",
      amountBux: claim.amountBux,
      walletAddress: claim.walletAddress,
      txSignature: claim.txSignature,
      claimedAt: claim.claimedAt,
      message: "Legacy rewards already claimed.",
    };
  }

  if (isLegacyClaimProcessing(entry.walletAddress)) {
    return {
      status: "processing",
      amountBux: entry.unclaimedAmount,
      walletAddress: entry.walletAddress,
      txSignature: null,
      claimedAt: null,
      message: "Claim in progress…",
    };
  }

  return {
    status: "pending",
    amountBux: entry.unclaimedAmount,
    walletAddress: entry.walletAddress,
    txSignature: null,
    claimedAt: null,
    message: null,
  };
}

export async function getLegacyClaimState(userId: string): Promise<LegacyClaimState> {
  const linkedWallets = await getLinkedWalletAddresses(userId);
  const entry = findEligibleEntry(linkedWallets);
  const claim = entry ? getLegacyClaimRecord(entry.walletAddress) : undefined;
  return mapToState(entry, claim);
}

export async function executeLegacyClaim(userId: string): Promise<LegacyClaimState> {
  const linkedWallets = await getLinkedWalletAddresses(userId);
  const entry = findEligibleEntry(linkedWallets);

  if (!entry || entry.unclaimedAmount <= 0) {
    throw new Error("No legacy rewards available");
  }

  const claim = getLegacyClaimRecord(entry.walletAddress);
  if (claim) {
    return mapToState(entry, claim);
  }

  const wallet = normalizeWallet(entry.walletAddress);
  if (!linkedWallets.some((linked) => normalizeWallet(linked) === wallet)) {
    throw new Error("Link the payout wallet to claim");
  }

  if (!beginLegacyClaim(wallet)) {
    throw new Error("Claim is no longer available");
  }

  const amountBux = BigInt(entry.unclaimedAmount);

  try {
    const signature = await sendLegacyAirdropBuxTransfer({
      recipientWallet: wallet,
      amountBux,
    });

    const record = saveLegacyClaimRecord(wallet, {
      amountBux: entry.unclaimedAmount,
      walletAddress: wallet,
      txSignature: signature,
      claimedAt: new Date().toISOString(),
    });

    return {
      status: "claimed",
      amountBux: record.amountBux,
      walletAddress: record.walletAddress,
      txSignature: record.txSignature,
      claimedAt: record.claimedAt,
      message: "Legacy rewards claimed successfully.",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claim failed";
    throw new Error(message);
  } finally {
    finishLegacyClaimProcessing(wallet);
  }
}

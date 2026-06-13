import { PublicKey } from "@solana/web3.js";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type LegacyAirdropEntry = {
  walletAddress: string;
  unclaimedAmount: number;
};

/** Merged payout list: wallet_address + total_unclaimed only (see docs/legacy-unclaimed-by-wallet.csv). */
const CSV_PATH = join(process.cwd(), "docs/legacy-unclaimed-by-wallet.csv");

let cache: { mtimeMs: number; byWallet: Map<string, LegacyAirdropEntry> } | null = null;

function normalizeWallet(address: string): string {
  return new PublicKey(address).toBase58();
}

function parseCsv(): Map<string, LegacyAirdropEntry> {
  const stat = statSync(CSV_PATH);
  if (cache && cache.mtimeMs === stat.mtimeMs) {
    return cache.byWallet;
  }

  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.trim().split("\n");
  const byWallet = new Map<string, LegacyAirdropEntry>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const [walletAddress, totalUnclaimed] = line.split(",");
    const unclaimedAmount = Number.parseInt(totalUnclaimed ?? "0", 10) || 0;
    if (!walletAddress?.trim() || unclaimedAmount <= 0) continue;

    try {
      const wallet = normalizeWallet(walletAddress.trim());
      byWallet.set(wallet, { walletAddress: wallet, unclaimedAmount });
    } catch {
      continue;
    }
  }

  cache = { mtimeMs: stat.mtimeMs, byWallet };
  return byWallet;
}

export function getLegacyAirdropByWallet(walletAddress: string): LegacyAirdropEntry | undefined {
  try {
    return parseCsv().get(normalizeWallet(walletAddress));
  } catch {
    return undefined;
  }
}

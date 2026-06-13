import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PublicKey } from "@solana/web3.js";

export type LegacyClaimRecord = {
  amountBux: number;
  walletAddress: string;
  txSignature: string;
  claimedAt: string;
};

type LegacyClaimsFile = Record<string, LegacyClaimRecord>;

const CLAIMS_PATH = join(process.cwd(), "data/legacy-claims.json");

const processing = new Set<string>();

function normalizeWallet(address: string): string {
  return new PublicKey(address).toBase58();
}

function readClaimsFile(): LegacyClaimsFile {
  try {
    const raw = readFileSync(CLAIMS_PATH, "utf8").trim();
    if (!raw) return {};
    return JSON.parse(raw) as LegacyClaimsFile;
  } catch {
    return {};
  }
}

function writeClaimsFile(claims: LegacyClaimsFile): void {
  mkdirSync(dirname(CLAIMS_PATH), { recursive: true });
  writeFileSync(CLAIMS_PATH, `${JSON.stringify(claims, null, 2)}\n`, "utf8");
}

export function getLegacyClaimRecord(walletAddress: string): LegacyClaimRecord | undefined {
  try {
    return readClaimsFile()[normalizeWallet(walletAddress)];
  } catch {
    return undefined;
  }
}

export function isLegacyClaimProcessing(walletAddress: string): boolean {
  try {
    return processing.has(normalizeWallet(walletAddress));
  } catch {
    return false;
  }
}

export function beginLegacyClaim(walletAddress: string): boolean {
  const wallet = normalizeWallet(walletAddress);
  if (processing.has(wallet) || readClaimsFile()[wallet]) {
    return false;
  }
  processing.add(wallet);
  return true;
}

export function finishLegacyClaimProcessing(walletAddress: string): void {
  try {
    processing.delete(normalizeWallet(walletAddress));
  } catch {
    // ignore invalid wallet
  }
}

export function saveLegacyClaimRecord(
  walletAddress: string,
  record: LegacyClaimRecord,
): LegacyClaimRecord {
  const wallet = normalizeWallet(walletAddress);
  const claims = readClaimsFile();
  if (claims[wallet]) {
    throw new Error("Legacy rewards already claimed");
  }
  claims[wallet] = { ...record, walletAddress: wallet };
  writeClaimsFile(claims);
  return claims[wallet];
}

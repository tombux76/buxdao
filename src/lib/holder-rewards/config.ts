export const BUX_DECIMALS = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);

export const HOLDER_REWARDS_CLAIM_FEE_LAMPORTS = Number.parseInt(
  process.env.HOLDER_REWARDS_CLAIM_FEE_LAMPORTS ?? "500000",
  10,
);

export function isHolderRewardsEnabled(): boolean {
  const v = process.env.HOLDER_REWARDS_ENABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getHolderRewardsCronSecret(): string {
  return (
    process.env.HOLDER_REWARDS_CRON_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

export function getTreasuryWallet(): string {
  return process.env.TREASURY_WALLET?.trim() || "";
}

export function getProjectWallet(): string {
  return (
    process.env.PROJECT_WALLET?.trim() ||
    process.env.NEXT_PUBLIC_PROJECT_WALLET?.trim() ||
    ""
  );
}

export function buxRawToNumber(raw: bigint | string | number): number {
  const n = typeof raw === "bigint" ? raw : BigInt(raw);
  return Number(n) / 10 ** BUX_DECIMALS;
}

/** Whole $BUX amounts (rewards are always integers). */
export function buxRawToWholeBux(raw: bigint | string | number): number {
  const n = typeof raw === "bigint" ? raw : BigInt(raw);
  return Number(n / BigInt(10 ** BUX_DECIMALS));
}

export function buxToRaw(amountBux: number): bigint {
  return BigInt(Math.floor(amountBux * 10 ** BUX_DECIMALS));
}

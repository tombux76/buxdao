import { tokenConfig } from "@/content/site";

export const BUXDAO5_ROLE_ID = "1248428373487784006";

/** Per-collection whale roles from `discord_role_catalog` seed. */
export const WHALE_ROLE_IDS = [
  "1095033899492573274", // MEGA BOT 🐋
  "1095033566070583457", // CAT 🐋
  "1093606438674382858", // MONSTER 🐋
  "1093606579355525252", // MONSTER 3D 🐋
] as const;

export const MAX_CASHOUT_SOL_NET = 1.5;
export const WHALE_REQUIRED_ABOVE_SOL_NET = 0.5;
export const DEFAULT_FEE_BPS = 1000; // 10%
export const BUXDAO5_FEE_BPS = 500; // 5%
export const MIN_CASHOUT_BUX = 1;
export const CASHOUT_COOLDOWN_DAYS = 14;
export const PENDING_CASHOUT_TTL_MINUTES = 15;
export const BUX_DECIMALS = 9;

export function getLiquidityWallet(): string {
  return tokenConfig.communityWallet;
}

export function getLiquidityPrivateKey(): string {
  return process.env.LIQUIDITY_WALLET_PRIVATE_KEY?.trim() ?? "";
}

export function isLiquidityConfigured(): boolean {
  const wallet = getLiquidityWallet();
  const key = getLiquidityPrivateKey();
  if (!wallet || !key) {
    return false;
  }
  return true;
}

export function buxToRaw(amountBux: number): bigint {
  return BigInt(Math.floor(amountBux * 10 ** BUX_DECIMALS));
}

export function buxRawToNumber(raw: bigint): number {
  return Number(raw) / 10 ** BUX_DECIMALS;
}

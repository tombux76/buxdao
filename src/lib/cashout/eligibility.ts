import { fetchHubWalletHoldings } from "@/lib/hub/wallet-nfts";
import { getDiscordRolesForUser } from "@/lib/hub/discord-roles";
import { listLinkedWalletAddresses, isWalletLinkedToUser } from "@/lib/holder-rewards/wallet-auth";
import {
  BUXDAO5_FEE_BPS,
  BUXDAO5_ROLE_ID,
  DEFAULT_FEE_BPS,
  MAX_CASHOUT_SOL_NET,
  WHALE_REQUIRED_ABOVE_SOL_NET,
  WHALE_ROLE_IDS,
  buxRawToNumber,
  buxToRaw,
  getLiquidityWallet,
  isLiquidityConfigured,
  MIN_CASHOUT_BUX,
} from "@/lib/cashout/config";
import { tokenConfig } from "@/content/site";
import { fetchTokenMetrics } from "@/lib/bux/metrics";

export type CashoutEligibility = {
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
};

function hasAnyRole(memberRoleIds: string[], targets: readonly string[]): boolean {
  const set = new Set(memberRoleIds);
  return targets.some((id) => set.has(id));
}

export async function getCashoutFeeBps(userId: string): Promise<number> {
  const { roles } = await getDiscordRolesForUser(userId);
  const hasBuxdao5 = roles.some((role) => role.id === BUXDAO5_ROLE_ID);
  return hasBuxdao5 ? BUXDAO5_FEE_BPS : DEFAULT_FEE_BPS;
}

export async function userHasHolderNft(userId: string): Promise<boolean> {
  const wallets = await listLinkedWalletAddresses(userId);
  if (wallets.length === 0) {
    return false;
  }

  for (const wallet of wallets) {
    const holdings = await fetchHubWalletHoldings(wallet);
    const totalNfts = Object.values(holdings.collections).reduce((sum, list) => sum + list.length, 0);
    if (totalNfts > 0) {
      return true;
    }
  }

  return false;
}

export async function userHasWhaleRole(userId: string): Promise<boolean> {
  const { roles } = await getDiscordRolesForUser(userId);
  return roles.some((role) => (WHALE_ROLE_IDS as readonly string[]).includes(role.id));
}

export async function getCashoutEligibility(params: {
  userId: string;
  payoutWallet: string;
}): Promise<CashoutEligibility> {
  const reasons: string[] = [];
  const linked = await isWalletLinkedToUser(params.userId, params.payoutWallet);

  const [hasHolderNft, hasWhaleRole, feeBps, metrics, holdings, rolesResult] = await Promise.all([
    userHasHolderNft(params.userId),
    userHasWhaleRole(params.userId),
    getCashoutFeeBps(params.userId),
    fetchTokenMetrics(),
    fetchHubWalletHoldings(params.payoutWallet),
    getDiscordRolesForUser(params.userId),
  ]);

  const hasBuxdao5 = rolesResult.roles.some((role) => role.id === BUXDAO5_ROLE_ID);
  const tokenValue = metrics?.tokenValue ?? 0;
  const buxBalance = holdings.buxBalance;
  const liquidityReady = isLiquidityConfigured();

  if (!linked) {
    reasons.push("Payout wallet must be linked to your Hub account.");
  }
  if (!hasHolderNft) {
    reasons.push("Hold at least one NFT from a BUXDAO collection in a linked wallet.");
  }
  if (buxBalance < MIN_CASHOUT_BUX) {
    reasons.push(`Minimum cashout is ${MIN_CASHOUT_BUX} $BUX.`);
  }
  if (tokenValue <= 0) {
    reasons.push("Token value is unavailable — try again shortly.");
  }
  if (!liquidityReady) {
    reasons.push("Cashout pool is not configured on the server yet.");
  }

  const feeMultiplier = 1 - feeBps / 10_000;
  const maxBuxCashout =
    tokenValue > 0 && feeMultiplier > 0
      ? Math.floor(MAX_CASHOUT_SOL_NET / (tokenValue * feeMultiplier))
      : 0;

  return {
    eligible: reasons.length === 0,
    reasons,
    hasHolderNft,
    hasWhaleRole,
    hasBuxdao5,
    feeBps,
    feePercent: feeBps / 100,
    maxSolNet: MAX_CASHOUT_SOL_NET,
    whaleThresholdSol: WHALE_REQUIRED_ABOVE_SOL_NET,
    minBux: MIN_CASHOUT_BUX,
    liquidityWallet: getLiquidityWallet(),
    mint: tokenConfig.mint,
    buxBalance,
    tokenValue,
    maxBuxCashout: Math.min(maxBuxCashout, Math.floor(buxBalance)),
    liquidityReady,
  };
}

export function quoteCashoutSol(params: {
  buxAmount: number;
  tokenValue: number;
  feeBps: number;
}): {
  solGross: number;
  feeSol: number;
  solNet: number;
  solGrossLamports: bigint;
  feeLamports: bigint;
  solNetLamports: bigint;
} {
  const solGross = params.buxAmount * params.tokenValue;
  const feeSol = solGross * (params.feeBps / 10_000);
  const solNet = solGross - feeSol;

  const toLamports = (sol: number) => BigInt(Math.floor(sol * 1e9));

  return {
    solGross,
    feeSol,
    solNet,
    solGrossLamports: toLamports(solGross),
    feeLamports: toLamports(feeSol),
    solNetLamports: toLamports(solNet),
  };
}

export function validateCashoutAmount(params: {
  amountBux: number;
  buxBalance: number;
  tokenValue: number;
  feeBps: number;
  hasWhaleRole: boolean;
}): string | null {
  if (!Number.isFinite(params.amountBux) || params.amountBux < MIN_CASHOUT_BUX) {
    return `Minimum cashout is ${MIN_CASHOUT_BUX} $BUX.`;
  }
  if (params.amountBux > params.buxBalance) {
    return "Amount exceeds your wallet $BUX balance.";
  }

  const quote = quoteCashoutSol({
    buxAmount: params.amountBux,
    tokenValue: params.tokenValue,
    feeBps: params.feeBps,
  });

  if (quote.solNet <= 0) {
    return "Cashout amount is too small.";
  }
  if (quote.solNet > MAX_CASHOUT_SOL_NET + 1e-9) {
    return `Maximum cashout is ${MAX_CASHOUT_SOL_NET} SOL (after fees).`;
  }
  if (quote.solNet > WHALE_REQUIRED_ABOVE_SOL_NET + 1e-9 && !params.hasWhaleRole) {
    return `Cashouts above ${WHALE_REQUIRED_ABOVE_SOL_NET} SOL require a whale role in at least one collection.`;
  }

  const maxRaw = buxToRaw(params.buxBalance);
  const amountRaw = buxToRaw(params.amountBux);
  if (amountRaw > maxRaw) {
    return "Amount exceeds your wallet $BUX balance.";
  }

  return null;
}

export function wholeBuxFromRaw(raw: bigint): number {
  return buxRawToNumber(raw);
}

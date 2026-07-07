import { tokenConfig } from "@/content/site";
import { fetchGravestakeUnclaimedStakingBux } from "@/lib/bux/gravestake-unclaimed";
import { buildRawHolders, isNonPublicSupplyWallet, type RawHolder } from "@/lib/bux/helius-holders";
import { getTotalUnclaimedDiscordBux } from "@/lib/holder-rewards/accounts";
import { hasHeliusApiKey } from "@/lib/helius-rpc";
import { getWalletBalanceSol } from "@/lib/solana/server-rpc";
import { getSolPrice } from "@/lib/sol-price";

export type TokenMetrics = {
  totalSupply: number;
  /** $BUX in wallets outside treasury / staking pools */
  heldPublicSupply: number;
  /** heldPublicSupply + unclaimed staking + unclaimed Discord */
  publicSupply: number;
  exemptSupply: number;
  unclaimedStakingRewards: number;
  unclaimedDiscordRewards: number;
  /** On-chain SOL in the liquidity wallet */
  walletBalanceSol: number;
  /** @deprecated Use walletBalanceSol — kept for existing Hub callers */
  liquidityPool: number;
  liquidityWallet: string;
  solPrice: number;
  tokenValue: number;
  tokenValueUsd: number;
};

async function fetchWalletBalanceSol(): Promise<number> {
  try {
    return await getWalletBalanceSol(tokenConfig.communityWallet);
  } catch {
    return 0;
  }
}

export async function fetchTokenMetrics(holdersInput?: RawHolder[]): Promise<TokenMetrics | null> {
  const holders = holdersInput ?? (await buildRawHolders());
  if (holders.length === 0 && !hasHeliusApiKey()) {
    return null;
  }

  let totalSupply = 0;
  let heldPublicSupply = 0;
  let exemptSupply = 0;

  for (const holder of holders) {
    totalSupply += holder.buxBalance;
    if (isNonPublicSupplyWallet(holder.wallet)) {
      exemptSupply += holder.buxBalance;
    } else {
      heldPublicSupply += holder.buxBalance;
    }
  }

  const [walletBalanceSol, solPrice, unclaimedStakingRewards, unclaimedDiscordRewards] =
    await Promise.all([
      fetchWalletBalanceSol(),
      getSolPrice(),
      fetchGravestakeUnclaimedStakingBux(),
      getTotalUnclaimedDiscordBux(),
    ]);

  const publicSupply =
    heldPublicSupply + unclaimedStakingRewards + unclaimedDiscordRewards;
  const publicSupplyNum = publicSupply > 0 ? publicSupply : 1;
  const tokenValue = walletBalanceSol / publicSupplyNum;
  const price = solPrice ?? 0;

  return {
    totalSupply,
    heldPublicSupply,
    publicSupply,
    exemptSupply,
    unclaimedStakingRewards,
    unclaimedDiscordRewards,
    walletBalanceSol,
    liquidityPool: walletBalanceSol,
    liquidityWallet: tokenConfig.communityWallet,
    solPrice: price,
    tokenValue,
    tokenValueUsd: tokenValue * price,
  };
}

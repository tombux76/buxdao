import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { tokenConfig } from "@/content/site";
import { getSolPrice } from "@/lib/sol-price";
import { buildRawHolders, isExemptWallet, type RawHolder } from "@/lib/bux/helius-holders";

export type TokenMetrics = {
  totalSupply: number;
  publicSupply: number;
  exemptSupply: number;
  liquidityPool: number;
  solPrice: number;
  tokenValue: number;
  tokenValueUsd: number;
};

async function fetchLiquidityPoolSol(): Promise<number> {
  const rpcUrl =
    process.env.SOLANA_RPC_URL ||
    (process.env.HELIUS_API_KEY
      ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
      : "https://api.mainnet-beta.solana.com");

  let onChainSol = 0;
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const balance = await connection.getBalance(new PublicKey(tokenConfig.communityWallet));
    onChainSol = balance / LAMPORTS_PER_SOL;
  } catch {
    onChainSol = 0;
  }

  return tokenConfig.liquidityOffsetSol + onChainSol;
}

export async function fetchTokenMetrics(holdersInput?: RawHolder[]): Promise<TokenMetrics | null> {
  const holders = holdersInput ?? (await buildRawHolders());
  if (holders.length === 0 && !process.env.HELIUS_API_KEY) {
    return null;
  }

  let totalSupply = 0;
  let publicSupply = 0;
  let exemptSupply = 0;

  for (const holder of holders) {
    totalSupply += holder.buxBalance;
    if (isExemptWallet(holder.wallet)) {
      exemptSupply += holder.buxBalance;
    } else {
      publicSupply += holder.buxBalance;
    }
  }

  const [liquidityPool, solPrice] = await Promise.all([fetchLiquidityPoolSol(), getSolPrice()]);
  const publicSupplyNum = publicSupply > 0 ? publicSupply : 1;
  const tokenValue = liquidityPool / publicSupplyNum;
  const price = solPrice ?? 0;

  return {
    totalSupply,
    publicSupply,
    exemptSupply,
    liquidityPool,
    solPrice: price,
    tokenValue,
    tokenValueUsd: tokenValue * price,
  };
}

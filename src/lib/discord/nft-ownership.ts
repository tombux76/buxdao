import type { CollectionConfig } from "@/content/site";
import { lookupGravestakePositionByMint } from "@/lib/gravestake";
import { withServerConnection } from "@/lib/solana/server-rpc";
import { PublicKey } from "@solana/web3.js";

type TokenOwnership = {
  owner: string | null;
  delegate: string | null;
};

/** RPC fallback when Helius DAS is down — token account owner + delegate. */
async function fetchMintTokenOwnership(mint: string): Promise<TokenOwnership | null> {
  try {
    return await withServerConnection(async (connection) => {
      const largest = await connection.getTokenLargestAccounts(new PublicKey(mint));
      const holding =
        largest.value.find((row) => (row.uiAmount ?? 0) > 0) ?? largest.value[0] ?? null;
      if (!holding) {
        return null;
      }
      const info = await connection.getParsedAccountInfo(holding.address);
      const data = info.value?.data;
      if (!data || typeof data === "string" || !("parsed" in data)) {
        return null;
      }
      const parsed = data.parsed as {
        info?: { owner?: string; delegate?: string | null };
      };
      return {
        owner: parsed.info?.owner?.trim() || null,
        delegate: parsed.info?.delegate?.trim() || null,
      };
    });
  } catch {
    return null;
  }
}

/**
 * Resolve display owner + GraveStake status for Discord `/nft` and `/rank`.
 * Soft-stake: token stays in user wallet with pool as delegate.
 * Hard-stake: token owner is the pool wallet — prefer GraveStake position owner.
 */
export async function resolveNftOwnerAndStake(
  config: CollectionConfig,
  mint: string,
  known?: TokenOwnership | null,
): Promise<{ owner: string | null; staked: boolean }> {
  const pool = config.stakingWallet?.trim() || null;
  const poolLower = pool?.toLowerCase() ?? null;

  let owner = known?.owner?.trim() || null;
  let delegate = known?.delegate?.trim() || null;

  if (!owner) {
    const rpc = await fetchMintTokenOwnership(mint);
    if (rpc) {
      owner = rpc.owner;
      delegate = rpc.delegate ?? delegate;
    }
  }

  if (poolLower && owner?.toLowerCase() === poolLower) {
    const position = await lookupGravestakePositionByMint(pool!, mint);
    return {
      owner: position?.owner ?? null,
      staked: true,
    };
  }

  return {
    owner,
    staked: Boolean(poolLower && delegate?.toLowerCase() === poolLower),
  };
}

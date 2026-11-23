import type { CollectionConfig } from "@/content/site";
import {
  fetchGravestakeWalletPositions,
  lookupGravestakePositionByMint,
} from "@/lib/gravestake";
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
 * Prefer GraveStake position (source of truth) — DAS often omits delegate when
 * soft-staked, and RPC can fail while positions still know the staker.
 */
export async function resolveNftOwnerAndStake(
  config: CollectionConfig,
  mint: string,
  known?: TokenOwnership | null,
): Promise<{ owner: string | null; staked: boolean }> {
  const pool = config.stakingWallet?.trim() || null;
  const poolLower = pool?.toLowerCase() ?? null;

  if (pool) {
    const position = await lookupGravestakePositionByMint(pool, mint);
    if (position?.owner) {
      return { owner: position.owner, staked: true };
    }
  }

  let owner = known?.owner?.trim() || null;
  let delegate = known?.delegate?.trim() || null;

  // RPC when DAS omitted owner (needed for truncated-wallet embed) or delegate (stake check).
  if (!owner || (poolLower && !delegate)) {
    const rpc = await fetchMintTokenOwnership(mint);
    if (rpc) {
      owner = owner ?? rpc.owner;
      delegate = delegate ?? rpc.delegate;
    }
  }

  if (poolLower && owner?.toLowerCase() === poolLower) {
    // Hard custody — position list can miss rows past the API cap.
    return { owner: null, staked: true };
  }

  if (poolLower && delegate?.toLowerCase() === poolLower) {
    return { owner, staked: true };
  }

  // Soft-stake can be missing from the capped pool list; wallet positions are complete.
  if (poolLower && owner) {
    try {
      const positions = await fetchGravestakeWalletPositions(owner);
      const hit = positions.find(
        (row) =>
          row.asset_mint === mint && row.pool_pubkey.toLowerCase() === poolLower,
      );
      if (hit) {
        return { owner, staked: true };
      }
    } catch {
      // keep chain answer
    }
  }

  return { owner, staked: false };
}

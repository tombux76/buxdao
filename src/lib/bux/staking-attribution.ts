import { hasHeliusApiKey, heliusRestFetch } from "@/lib/helius-rpc";

const CACHE_TTL_MS = 5 * 60 * 1000;

type HeliusTransfer = {
  fromUserAccount?: string;
  toUserAccount?: string;
  mint?: string;
  tokenAmount?: number;
  tokenStandard?: string;
};

type HeliusParsedTx = {
  signature?: string;
  tokenTransfers?: HeliusTransfer[];
};

const depositorCache = new Map<string, { at: number; map: Map<string, string> }>();

/** Map NFT mint -> wallet that deposited into a GraveStake staking wallet. */
export async function fetchStakingDepositors(stakingWallet: string): Promise<Map<string, string>> {
  const cacheKey = stakingWallet.toLowerCase();
  const cached = depositorCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.map;
  }

  const depositors = new Map<string, string>();
  if (!hasHeliusApiKey()) {
    return depositors;
  }

  let before: string | undefined;
  for (let page = 0; page < 30; page++) {
    const response = await heliusRestFetch(
      `/v0/addresses/${stakingWallet}/transactions`,
      {},
      {
        searchParams: {
          limit: "100",
          before,
        },
        timeoutMs: 20_000,
        softFail: true,
      },
    );

    if (!response.ok) {
      break;
    }

    let txs: HeliusParsedTx[];
    try {
      txs = (await response.json()) as HeliusParsedTx[];
    } catch {
      break;
    }

    if (!Array.isArray(txs) || txs.length === 0) {
      break;
    }

    for (const tx of txs) {
      for (const transfer of tx.tokenTransfers ?? []) {
        if (
          transfer.toUserAccount === stakingWallet &&
          transfer.fromUserAccount &&
          transfer.mint &&
          (transfer.tokenStandard?.includes("NonFungible") || transfer.tokenAmount === 1)
        ) {
          depositors.set(transfer.mint, transfer.fromUserAccount);
        }
      }
    }

    before = txs[txs.length - 1]?.signature;
    if (!before || txs.length < 100) {
      break;
    }
  }

  depositorCache.set(cacheKey, { at: Date.now(), map: depositors });
  return depositors;
}

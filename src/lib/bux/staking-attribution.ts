const HELIUS_API = "https://api.helius.xyz/v0";
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

  const apiKey = process.env.HELIUS_API_KEY;
  const depositors = new Map<string, string>();
  if (!apiKey) {
    return depositors;
  }

  let before: string | undefined;
  for (let page = 0; page < 30; page++) {
    const url = new URL(`${HELIUS_API}/addresses/${stakingWallet}/transactions`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("limit", "100");
    if (before) {
      url.searchParams.set("before", before);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    let txs: HeliusParsedTx[];
    try {
      const response = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        break;
      }
      txs = (await response.json()) as HeliusParsedTx[];
    } catch {
      break;
    } finally {
      clearTimeout(timeout);
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

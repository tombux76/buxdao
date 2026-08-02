import { hasHeliusApiKey, heliusRestFetch } from "@/lib/helius-rpc";

const CACHE_TTL_MS = 5 * 60 * 1000;
const USER_TX_CACHE_TTL_MS = 60_000;

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
const userTxCache = new Map<string, { at: number; txs: HeliusParsedTx[] }>();

function isNftTransfer(transfer: HeliusTransfer): boolean {
  return Boolean(
    transfer.mint &&
      (transfer.tokenStandard?.includes("NonFungible") || transfer.tokenAmount === 1),
  );
}

async function fetchAddressTransactions(
  address: string,
  maxPages: number,
): Promise<HeliusParsedTx[]> {
  if (!hasHeliusApiKey()) {
    return [];
  }

  const txs: HeliusParsedTx[] = [];
  let before: string | undefined;

  for (let page = 0; page < maxPages; page += 1) {
    const response = await heliusRestFetch(
      `/v0/addresses/${address}/transactions`,
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

    let batch: HeliusParsedTx[];
    try {
      batch = (await response.json()) as HeliusParsedTx[];
    } catch {
      break;
    }

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    txs.push(...batch);
    before = batch[batch.length - 1]?.signature;
    if (!before || batch.length < 100) {
      break;
    }
  }

  return txs;
}

/** Cached enhanced tx history for a wallet (newest first). */
export async function fetchWalletTransactionHistory(
  wallet: string,
  maxPages = 40,
): Promise<HeliusParsedTx[]> {
  const cacheKey = wallet.toLowerCase();
  const cached = userTxCache.get(cacheKey);
  if (cached && Date.now() - cached.at < USER_TX_CACHE_TTL_MS) {
    return cached.txs;
  }
  const txs = await fetchAddressTransactions(wallet, maxPages);
  userTxCache.set(cacheKey, { at: Date.now(), txs });
  return txs;
}

/** Map NFT mint -> wallet that deposited into a GraveStake staking wallet. */
export async function fetchStakingDepositors(stakingWallet: string): Promise<Map<string, string>> {
  const cacheKey = stakingWallet.toLowerCase();
  const cached = depositorCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.map;
  }

  const depositors = new Map<string, string>();
  const txs = await fetchAddressTransactions(stakingWallet, 50);

  for (const tx of txs) {
    for (const transfer of tx.tokenTransfers ?? []) {
      if (
        transfer.toUserAccount === stakingWallet &&
        transfer.fromUserAccount &&
        isNftTransfer(transfer) &&
        transfer.mint
      ) {
        depositors.set(transfer.mint, transfer.fromUserAccount);
      }
    }
  }

  depositorCache.set(cacheKey, { at: Date.now(), map: depositors });
  return depositors;
}

/**
 * Mints the user still has staked in a pool, derived from the user's own tx history
 * (deposit to pool / withdraw from pool) rather than scanning the entire pool history.
 */
export function stakedMintsFromUserHistory(params: {
  userWallet: string;
  stakingWallet: string;
  txs: HeliusParsedTx[];
  currentlyStakedMints: Set<string>;
}): string[] {
  const { userWallet, stakingWallet, txs, currentlyStakedMints } = params;
  const held = new Set<string>();

  // Chronological order so final set reflects net currently-attributed deposits.
  for (const tx of [...txs].reverse()) {
    for (const transfer of tx.tokenTransfers ?? []) {
      if (!isNftTransfer(transfer) || !transfer.mint) {
        continue;
      }
      if (transfer.fromUserAccount === userWallet && transfer.toUserAccount === stakingWallet) {
        held.add(transfer.mint);
      }
      if (transfer.fromUserAccount === stakingWallet && transfer.toUserAccount === userWallet) {
        held.delete(transfer.mint);
      }
    }
  }

  return [...held].filter((mint) => currentlyStakedMints.has(mint));
}

export async function fetchUserStakedMints(params: {
  userWallet: string;
  stakingWallet: string;
  currentlyStakedMints: Set<string>;
  txs?: HeliusParsedTx[];
}): Promise<string[]> {
  const txs = params.txs ?? (await fetchWalletTransactionHistory(params.userWallet));
  return stakedMintsFromUserHistory({
    userWallet: params.userWallet,
    stakingWallet: params.stakingWallet,
    txs,
    currentlyStakedMints: params.currentlyStakedMints,
  });
}

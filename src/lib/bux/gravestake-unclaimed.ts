import { PublicKey } from "@solana/web3.js";
import { collectionConfigs } from "@/content/site";
import { withServerConnection } from "@/lib/solana/server-rpc";

const GRAVESTAKE_API = "https://api.solanadeads.com";
/** BUX pending_rewards[0] byte offset in GraveStake position accounts (legacy layout). */
const PENDING_BUX_OFFSET = 193;
const BUX_DECIMALS = 9;
const POSITION_BATCH = 100;

type GravestakePositionRow = {
  position_pubkey: string;
};

async function fetchPoolPositions(poolPubkey: string): Promise<string[]> {
  const url = `${GRAVESTAKE_API}/gravestake/pools/${encodeURIComponent(poolPubkey)}/positions`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    return [];
  }

  const data = (await res.json()) as { positions?: GravestakePositionRow[] };
  return (data.positions ?? []).map((row) => row.position_pubkey).filter(Boolean);
}

function readPendingBuxFromPosition(data: Buffer): number {
  if (data.length < PENDING_BUX_OFFSET + 8) {
    return 0;
  }
  const raw = data.readBigUInt64LE(PENDING_BUX_OFFSET);
  return Number(raw) / 10 ** BUX_DECIMALS;
}

async function sumPendingBuxForPool(poolPubkey: string): Promise<number> {
  const positionKeys = await fetchPoolPositions(poolPubkey);
  if (positionKeys.length === 0) {
    return 0;
  }

  return withServerConnection(async (connection) => {
    let total = 0;
    for (let i = 0; i < positionKeys.length; i += POSITION_BATCH) {
      const batch = positionKeys.slice(i, i + POSITION_BATCH);
      const accounts = await connection.getMultipleAccountsInfo(batch.map((key) => new PublicKey(key)));
      for (const account of accounts) {
        if (!account?.data) {
          continue;
        }
        total += readPendingBuxFromPosition(account.data);
      }
    }
    return total;
  });
}

/** Sum unclaimed $BUX across live GraveStake pools (BUX reward slot only). */
export async function fetchGravestakeUnclaimedStakingBux(): Promise<number> {
  const livePools = collectionConfigs.filter((config) => config.stakeLive && config.stakingWallet);
  if (livePools.length === 0) {
    return 0;
  }

  try {
    const totals = await Promise.all(
      livePools.map((config) => sumPendingBuxForPool(config.stakingWallet!)),
    );
    return totals.reduce((sum, value) => sum + value, 0);
  } catch {
    return 0;
  }
}

import { collectionConfigs } from "@/content/site";
import { getPool } from "@/lib/db";
import { getRewardDateEt } from "@/lib/holder-rewards/dates";
import { isExcludedOwner } from "@/lib/holder-rewards/excluded-owners";
import {
  collectionMintFor,
  fetchAssetOwner,
  fetchAssetsByOwner,
  type DasAsset,
} from "@/lib/holder-rewards/helius";

export type QualifyingNft = {
  mint: string;
  collectionId: string;
  wallet: string;
  userId: string;
};

type WalletLinkRow = {
  user_id: number;
  wallet_address: string;
};

type HoldRow = {
  mint: string;
  holder_user_id: number | null;
  last_owner: string | null;
  hold_started_at: Date | null;
};

export async function listAllLinkedWallets(): Promise<WalletLinkRow[]> {
  const pool = getPool();
  const { rows } = await pool.query<WalletLinkRow>(
    `SELECT user_id, wallet_address FROM user_wallets ORDER BY user_id, wallet_address`,
  );
  return rows;
}

function mintToConfig(): Map<string, (typeof collectionConfigs)[number]> {
  return new Map(collectionConfigs.map((c) => [c.collectionMint, c] as const));
}

export function qualifyingNftsFromAssets(
  assets: DasAsset[],
  wallet: string,
  userId: string,
): QualifyingNft[] {
  const mintToCollection = mintToConfig();
  const out: QualifyingNft[] = [];

  for (const asset of assets) {
    const mint = asset.id;
    if (!mint) {
      continue;
    }
    const collectionMint = collectionMintFor(asset);
    const config = collectionMint ? mintToCollection.get(collectionMint) : undefined;
    if (!config) {
      continue;
    }
    out.push({
      mint,
      collectionId: config.id,
      wallet,
      userId,
    });
  }

  return out;
}

export async function discoverQualifyingNfts(
  links: WalletLinkRow[],
): Promise<Map<string, QualifyingNft[]>> {
  const byUser = new Map<string, QualifyingNft[]>();

  for (const link of links) {
    const userId = String(link.user_id);
    const assets = await fetchAssetsByOwner(link.wallet_address);
    const nfts = qualifyingNftsFromAssets(assets, link.wallet_address, userId);
    const existing = byUser.get(userId) ?? [];
    existing.push(...nfts);
    byUser.set(userId, existing);
  }

  return byUser;
}

async function getHoldRow(mint: string): Promise<HoldRow | null> {
  const pool = getPool();
  const { rows } = await pool.query<HoldRow>(
    `SELECT mint, holder_user_id, last_owner, hold_started_at
     FROM holder_nft_hold_tracking WHERE mint = $1`,
    [mint],
  );
  return rows[0] ?? null;
}

function midnightUtcForEtDate(rewardDateEt: string): Date {
  return new Date(`${rewardDateEt}T05:00:00.000Z`);
}

async function upsertHoldRow(params: {
  mint: string;
  holderUserId: number;
  lastOwner: string;
  holdStartedAt: Date | null;
}): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO holder_nft_hold_tracking (mint, holder_user_id, last_owner, hold_started_at, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (mint) DO UPDATE SET
       holder_user_id = EXCLUDED.holder_user_id,
       last_owner = EXCLUDED.last_owner,
       hold_started_at = EXCLUDED.hold_started_at,
       updated_at = now()`,
    [params.mint, params.holderUserId, params.lastOwner, params.holdStartedAt?.toISOString() ?? null],
  );
}

export async function syncHoldStateForNft(
  nft: QualifyingNft,
  rewardDateEt: string,
): Promise<void> {
  const existing = await getHoldRow(nft.mint);
  const restartAt = midnightUtcForEtDate(rewardDateEt);
  const userId = Number.parseInt(nft.userId, 10);

  let holdStartedAt = existing?.hold_started_at ?? null;

  if (!existing) {
    holdStartedAt = restartAt;
  } else if (isExcludedOwner(existing.last_owner)) {
    holdStartedAt = restartAt;
  } else if (existing.last_owner !== nft.wallet) {
    if (existing.holder_user_id !== userId) {
      holdStartedAt = restartAt;
    }
  } else if (!holdStartedAt) {
    holdStartedAt = restartAt;
  }

  await upsertHoldRow({
    mint: nft.mint,
    holderUserId: userId,
    lastOwner: nft.wallet,
    holdStartedAt,
  });
}

export async function syncStaleHoldMints(activeMints: Set<string>): Promise<void> {
  const pool = getPool();
  const { rows } = await pool.query<{ mint: string }>(
    `SELECT mint FROM holder_nft_hold_tracking WHERE hold_started_at IS NOT NULL`,
  );

  for (const row of rows) {
    if (activeMints.has(row.mint)) {
      continue;
    }
    const owner = await fetchAssetOwner(row.mint);
    if (!owner || isExcludedOwner(owner)) {
      await pool.query(
        `UPDATE holder_nft_hold_tracking
         SET hold_started_at = NULL, last_owner = $2, holder_user_id = NULL, updated_at = now()
         WHERE mint = $1`,
        [row.mint, owner],
      );
    }
  }
}

export async function syncAllHoldStates(rewardDateEt = getRewardDateEt()): Promise<void> {
  const links = await listAllLinkedWallets();
  const byUser = await discoverQualifyingNfts(links);
  const activeMints = new Set<string>();

  for (const nfts of byUser.values()) {
    for (const nft of nfts) {
      activeMints.add(nft.mint);
      await syncHoldStateForNft(nft, rewardDateEt);
    }
  }

  await syncStaleHoldMints(activeMints);
}

export async function getHoldStartedAtForMint(mint: string): Promise<Date | null> {
  const row = await getHoldRow(mint);
  return row?.hold_started_at ?? null;
}

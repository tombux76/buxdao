import { collectionConfigs } from "@/content/site";
import { fetchAsset, resolveAssetImage } from "@/lib/discord/helius";
import { heliusRpc } from "@/lib/helius-rpc";
import { buildActivityEmbed } from "@/lib/discord/nft-embed";
import { markActivityProcessed } from "@/lib/nft-activity/dedup";
import { postActivityEmbed } from "@/lib/nft-activity/discord-poster";
import { parseGravestakeTransaction, type ParsedGravestakeEvent } from "@/lib/nft-activity/gravestake-parser";
import {
  getLastGravestakeBlockTime,
  hasGravestakeSyncState,
  setLastGravestakeBlockTime,
} from "@/lib/nft-activity/gravestake-sync-state";
import type { CollectionConfig } from "@/content/site";

const OVERLAP_SEC = 5 * 60;
const INCREMENTAL_SIGNATURE_LIMIT = 25;
const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_MAX_PAGES = 200;

type SignatureInfo = {
  signature: string;
  blockTime: number | null;
  err: unknown;
};

type RpcTransaction = Parameters<typeof parseGravestakeTransaction>[2];

export type GravestakeActivitySyncResult = {
  poolsPolled: number;
  signaturesFetched: number;
  eventsMatched: number;
  posted: number;
  skipped: number;
  errors: string[];
};

function getLiveStakingCollections(): CollectionConfig[] {
  return collectionConfigs.filter((config) => config.stakeLive && config.stakingWallet);
}

async function heliusRpcStrict<T>(method: string, params: unknown): Promise<T> {
  const result = await heliusRpc<T>(method, params);
  return result as T;
}

async function fetchSignaturePage(
  poolWallet: string,
  limit: number,
  before?: string,
): Promise<SignatureInfo[]> {
  const options: { limit: number; before?: string } = { limit };
  if (before) {
    options.before = before;
  }

  const result = await heliusRpcStrict<SignatureInfo[] | null>("getSignaturesForAddress", [
    poolWallet,
    options,
  ]);
  return result ?? [];
}

async function fetchIncrementalSignatures(poolWallet: string): Promise<SignatureInfo[]> {
  return fetchSignaturePage(poolWallet, INCREMENTAL_SIGNATURE_LIMIT);
}

async function fetchAllSignatures(poolWallet: string): Promise<SignatureInfo[]> {
  const all: SignatureInfo[] = [];
  let before: string | undefined;

  for (let page = 0; page < BACKFILL_MAX_PAGES; page += 1) {
    const batch = await fetchSignaturePage(poolWallet, BACKFILL_PAGE_SIZE, before);
    if (batch.length === 0) {
      break;
    }

    all.push(...batch);
    before = batch[batch.length - 1]?.signature;

    if (batch.length < BACKFILL_PAGE_SIZE || !before) {
      break;
    }
  }

  return all;
}

async function fetchTransaction(signature: string): Promise<RpcTransaction | null> {
  return heliusRpcStrict<RpcTransaction | null>("getTransaction", [
    signature,
    { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 },
  ]);
}

async function resolveCollectionForMint(
  mint: string,
  expectedCollectionMint: string,
): Promise<boolean> {
  const asset = await fetchAsset(mint);
  const collectionMint = asset?.grouping?.find((group) => group.group_key === "collection")?.group_value;
  return collectionMint === expectedCollectionMint;
}

async function processGravestakeEvent(
  config: CollectionConfig,
  event: ParsedGravestakeEvent,
): Promise<"posted" | "skipped" | "duplicate"> {
  const belongs = await resolveCollectionForMint(event.mint, config.collectionMint);
  if (!belongs) {
    return "skipped";
  }

  const isNew = await markActivityProcessed({
    signature: event.signature,
    mint: event.mint,
    eventType: event.eventType,
  });
  if (!isNew) {
    return "duplicate";
  }

  const live = await fetchAsset(event.mint);
  const name = live?.content?.metadata?.name?.trim() || `${config.name} NFT`;
  const image = await resolveAssetImage(live);
  const owner = event.eventType === "stake" ? config.stakingWallet ?? null : event.staker;

  const embed = await buildActivityEmbed(config, {
    mint: event.mint,
    name,
    image,
    owner,
    eventType: event.eventType,
    staker: event.staker,
    platform: "GraveStake",
    signature: event.signature,
  });

  await postActivityEmbed(embed);
  return "posted";
}

export async function syncGravestakeActivity(): Promise<GravestakeActivitySyncResult> {
  const result: GravestakeActivitySyncResult = {
    poolsPolled: 0,
    signaturesFetched: 0,
    eventsMatched: 0,
    posted: 0,
    skipped: 0,
    errors: [],
  };

  const livePools = getLiveStakingCollections();
  if (livePools.length === 0) {
    return result;
  }

  for (const config of livePools) {
    const poolWallet = config.stakingWallet;
    if (!poolWallet) {
      continue;
    }

    result.poolsPolled += 1;

    try {
      const isBackfill = !(await hasGravestakeSyncState(config.id));
      const sinceSec =
        Math.floor((await getLastGravestakeBlockTime(config.id)).getTime() / 1000) -
        (isBackfill ? 0 : OVERLAP_SEC);
      const signatures = isBackfill
        ? await fetchAllSignatures(poolWallet)
        : await fetchIncrementalSignatures(poolWallet);
      result.signaturesFetched += signatures.length;

      const ordered = [...signatures]
        .filter((entry) => !entry.err && entry.blockTime != null)
        .sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

      let maxBlockTime = sinceSec;

      for (const entry of ordered) {
        const blockTime = entry.blockTime ?? 0;
        if (blockTime > maxBlockTime) {
          maxBlockTime = blockTime;
        }

        if (blockTime <= sinceSec) {
          result.skipped += 1;
          continue;
        }

        const tx = await fetchTransaction(entry.signature);
        if (!tx) {
          result.skipped += 1;
          continue;
        }

        const parsed = parseGravestakeTransaction(entry.signature, blockTime, tx, poolWallet);
        if (!parsed) {
          result.skipped += 1;
          continue;
        }

        result.eventsMatched += 1;

        try {
          const outcome = await processGravestakeEvent(config, parsed);
          if (outcome === "posted") {
            result.posted += 1;
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(
            `${config.id}:${entry.signature}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // Backfill only marks the pool caught up after a full pass (dedup prevents reposts on retry).
      if (ordered.length > 0) {
        await setLastGravestakeBlockTime(config.id, new Date(maxBlockTime * 1000));
      }
    } catch (error) {
      result.errors.push(`${config.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return result;
}

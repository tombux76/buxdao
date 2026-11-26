import { getCollectionConfig } from "@/lib/discord/config";
import {
  fetchOrbisCollectionActivity,
  getBuxdaoOrbisCollections,
  getOrbisApiKey,
  type OrbisActivityEvent,
} from "@/lib/nft-activity/orbis-client";
import {
  mapOrbisEventType,
  orbisEventTime,
  processOrbisActivityEvent,
} from "@/lib/nft-activity/orbis-activity";
import {
  getLastOrbisEventTime,
  setLastOrbisEventTime,
} from "@/lib/nft-activity/orbis-sync-state";

const OVERLAP_MS = 5 * 60 * 1000;
const PAGE_LIMIT = 50;

export type OrbisActivitySyncResult = {
  collectionsPolled: number;
  eventsFetched: number;
  eventsMatched: number;
  posted: number;
  skipped: number;
  errors: string[];
};

export type OrbisActivitySyncOptions = {
  /** Override lookback for backfill (ms). When set, ignores stored cursor for this run's since window. */
  lookbackMs?: number;
};

export async function syncOrbisActivity(
  options: OrbisActivitySyncOptions = {},
): Promise<OrbisActivitySyncResult> {
  if (!getOrbisApiKey()) {
    throw new Error("ORBIS_API_KEY is not configured");
  }

  const result: OrbisActivitySyncResult = {
    collectionsPolled: 0,
    eventsFetched: 0,
    eventsMatched: 0,
    posted: 0,
    skipped: 0,
    errors: [],
  };

  for (const collection of getBuxdaoOrbisCollections()) {
    const config = getCollectionConfig(collection.id);
    if (!config) continue;

    result.collectionsPolled += 1;

    try {
      const storedSince = await getLastOrbisEventTime(collection.id);
      const since = new Date(
        options.lookbackMs != null
          ? Date.now() - options.lookbackMs
          : storedSince.getTime() - OVERLAP_MS,
      );
      let maxProcessedEventTime = since;

      const events = await fetchOrbisCollectionActivity({
        collectionAddress: collection.collectionMint,
        limit: PAGE_LIMIT,
      });
      result.eventsFetched += events.length;

      const ordered = [...events].sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      );

      for (const event of ordered) {
        const eventTime = orbisEventTime(event);
        if (eventTime && eventTime <= since) {
          result.skipped += 1;
          continue;
        }

        if (!mapOrbisEventType(event.type)) {
          result.skipped += 1;
          continue;
        }

        result.eventsMatched += 1;

        try {
          const outcome = await processOrbisActivityEvent(config, event);
          if (outcome === "posted" || outcome === "duplicate") {
            if (outcome === "posted") {
              result.posted += 1;
            } else {
              result.skipped += 1;
            }
            if (eventTime && eventTime > maxProcessedEventTime) {
              maxProcessedEventTime = eventTime;
            }
          } else {
            result.skipped += 1;
          }
        } catch (error) {
          result.errors.push(
            `${collection.id}:${event.txSignature ?? event.id ?? "?"}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Advance cursor even on backfill so subsequent polls stay incremental.
      if (maxProcessedEventTime > since) {
        await setLastOrbisEventTime(collection.id, maxProcessedEventTime);
      } else if (options.lookbackMs != null) {
        const newest = newestEventTime(ordered);
        if (newest) {
          await setLastOrbisEventTime(collection.id, newest);
        }
      }
    } catch (error) {
      result.errors.push(
        `${collection.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return result;
}

function newestEventTime(events: OrbisActivityEvent[]): Date | null {
  let max = 0;
  for (const event of events) {
    if (typeof event.timestamp === "number" && event.timestamp > max) {
      max = event.timestamp;
    }
  }
  return max > 0 ? new Date(max) : null;
}

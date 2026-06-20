/**
 * Poll GraveMarket for BUXDAO collection activity and post Discord alerts.
 *
 * Usage:
 *   npx tsx scripts/gravemarket-activity-sync.ts
 */
import { readFileSync } from "node:fs";
import { syncGravemarketActivity } from "../src/lib/nft-activity/gravemarket-sync";

function loadEnvFile(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile();

async function main(): Promise<void> {
  const result = await syncGravemarketActivity();
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("GraveMarket activity sync failed:", error);
  process.exit(1);
});

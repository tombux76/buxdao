/**
 * Poll Orbis for BUXDAO collection activity and post Discord alerts.
 *
 * Usage:
 *   npx tsx scripts/orbis-activity-sync.ts
 *   npx tsx scripts/orbis-activity-sync.ts --lookbackHours 48
 */
import { readFileSync } from "node:fs";
import { syncOrbisActivity } from "../src/lib/nft-activity/orbis-sync";

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

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

loadEnvFile();

async function main(): Promise<void> {
  const lookbackHoursRaw = getArg("--lookbackHours");
  const lookbackHours = lookbackHoursRaw ? Number.parseFloat(lookbackHoursRaw) : NaN;
  const lookbackMs =
    Number.isFinite(lookbackHours) && lookbackHours > 0
      ? Math.min(lookbackHours, 168) * 60 * 60 * 1000
      : undefined;

  const result = await syncOrbisActivity({ lookbackMs });
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Orbis activity sync failed:", error);
  process.exit(1);
});

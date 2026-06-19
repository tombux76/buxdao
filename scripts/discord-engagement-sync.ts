/**
 * Poll Discord for engagement rewards (messages + announcement reactions).
 *
 * Usage:
 *   npx tsx scripts/discord-engagement-sync.ts
 */
import { readFileSync } from "node:fs";
import { syncDiscordEngagementRewards } from "../src/lib/holder-rewards/discord-engagement-sync";

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
  const result = await syncDiscordEngagementRewards();
  console.log(JSON.stringify(result, null, 2));

  if (result.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Discord engagement sync failed:", error);
  process.exit(1);
});

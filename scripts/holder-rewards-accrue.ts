/**
 * Daily holder rewards accrual — run locally or in GitHub Actions.
 *
 * Usage:
 *   npx tsx scripts/holder-rewards-accrue.ts
 *   npx tsx scripts/holder-rewards-accrue.ts --date 2026-06-11
 */
import { readFileSync } from "node:fs";
import { runDailyAccrual } from "@/lib/holder-rewards/accrual";
import { getRewardDateEt } from "@/lib/holder-rewards/dates";
import { hasHeliusApiKey } from "@/lib/helius-rpc";

function loadEnvFile(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional when env vars are already set (e.g. GitHub Actions)
  }
}

loadEnvFile();
process.env.HOLDER_REWARDS_ENABLED = "true";

const dateArgIndex = process.argv.indexOf("--date");
const rewardDateEt =
  dateArgIndex >= 0 ? process.argv[dateArgIndex + 1]?.trim() || getRewardDateEt() : getRewardDateEt();

if (!process.env.POSTGRES_URL) {
  console.error("POSTGRES_URL is required");
  process.exit(1);
}
if (!hasHeliusApiKey()) {
  console.error("HELIUS_API_KEY (or HELIUS_API_KEY_2) is required");
  process.exit(1);
}

console.log(`Running holder rewards accrual for ${rewardDateEt} (ET)…`);

try {
  const result = await runDailyAccrual(rewardDateEt);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error("Accrual failed:", error);
  process.exit(1);
}

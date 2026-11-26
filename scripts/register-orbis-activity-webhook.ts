/**
 * Register an Orbis activity webhook for BUXDAO collections.
 *
 * Usage:
 *   npx tsx scripts/register-orbis-activity-webhook.ts
 *   npx tsx scripts/register-orbis-activity-webhook.ts --url https://www.buxdao.com/api/nft-activity/orbis-webhook
 *   npx tsx scripts/register-orbis-activity-webhook.ts --list
 */
import { readFileSync } from "node:fs";
import {
  getBuxdaoOrbisCollections,
  getOrbisWebhookSecret,
  listOrbisWebhooks,
  registerOrbisWebhook,
} from "../src/lib/nft-activity/orbis-client";

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
  if (process.argv.includes("--list")) {
    const webhooks = await listOrbisWebhooks();
    console.log(JSON.stringify(webhooks, null, 2));
    return;
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    "https://www.buxdao.com";
  const url =
    getArg("--url") ?? `${siteUrl.replace(/\/$/, "")}/api/nft-activity/orbis-webhook`;

  const collections = getBuxdaoOrbisCollections().map((c) => c.collectionMint);
  const secret = getOrbisWebhookSecret() ?? undefined;

  const result = await registerOrbisWebhook({
    url,
    events: ["sale", "offer_accepted", "listing", "delist"],
    collections,
    secret,
  });

  console.log(JSON.stringify({ url, collections, result }, null, 2));
}

main().catch((error) => {
  console.error("Orbis webhook registration failed:", error);
  process.exit(1);
});

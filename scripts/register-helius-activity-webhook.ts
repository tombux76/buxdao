/**
 * Register (or update) a Helius enhanced webhook for BUXDAO NFT activity alerts.
 *
 * Usage:
 *   npx tsx scripts/register-helius-activity-webhook.ts
 *   npx tsx scripts/register-helius-activity-webhook.ts --url https://www.buxdao.com/api/nft-activity/webhook
 */
import { readFileSync } from "node:fs";
import {
  getCollectionMintAddresses,
  getHeliusWebhookSecret,
  NFT_ACTIVITY_EVENT_TYPES,
} from "../src/lib/nft-activity/config";

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

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

loadEnvFile();

const HELIUS_WEBHOOKS_API = "https://mainnet.helius-rpc.com/v0/webhooks";

function heliusWebhooksUrl(apiKey: string, webhookId?: string): string {
  const url = new URL(webhookId ? `${HELIUS_WEBHOOKS_API}/${webhookId}` : HELIUS_WEBHOOKS_API);
  url.searchParams.set("api-key", apiKey);
  return url.toString();
}

async function listWebhooks(apiKey: string) {
  const response = await fetch(heliusWebhooksUrl(apiKey), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`List webhooks failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as { webhookID: string; webhookURL: string }[];
}

async function createWebhook(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch(heliusWebhooksUrl(apiKey), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Create webhook failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function updateWebhook(apiKey: string, webhookId: string, body: Record<string, unknown>) {
  const response = await fetch(heliusWebhooksUrl(apiKey, webhookId), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Update webhook failed (${response.status}): ${await response.text()}`);
  }
  return response.json();
}

async function main(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is required");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.buxdao.com";
  const webhookURL =
    getArg("--url") ?? `${siteUrl.replace(/\/$/, "")}/api/nft-activity/webhook`;
  const secret = getHeliusWebhookSecret();
  const accountAddresses = getCollectionMintAddresses();

  const body: Record<string, unknown> = {
    webhookURL,
    transactionTypes: [...NFT_ACTIVITY_EVENT_TYPES],
    accountAddresses,
    webhookType: "enhanced",
    txnStatus: "success",
  };

  if (secret) {
    body.authHeader = secret.startsWith("Bearer ") ? secret : `Bearer ${secret}`;
  }

  const existing = await listWebhooks(apiKey);
  const match = existing.find((w) => w.webhookURL === webhookURL);

  const result = match
    ? await updateWebhook(apiKey, match.webhookID, body)
    : await createWebhook(apiKey, body);

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nWebhook ${match ? "updated" : "created"} for ${accountAddresses.length} collections → ${webhookURL}`);
}

main().catch((error) => {
  console.error("Helius webhook registration failed:", error);
  process.exit(1);
});

/**
 * Backfill missed NFT activity alerts from Helius enhanced transaction history.
 *
 * Usage:
 *   npx tsx scripts/backfill-nft-activity.ts --mint 83srDBwNm86MhDA69AgeBf4BMS4KToefZZomoxqSvwRG
 *   npx tsx scripts/backfill-nft-activity.ts --sig 3pifRCGyGxh1PD9gdaBo1f8CHwhia9XbDci9M1HmmFnJzfNHa8J5XkYxbvYrJMvybgCbW4MLGGgwYUo83AzrotpH
 */
import { readFileSync } from "node:fs";
import { processHeliusActivityPayload } from "../src/lib/nft-activity/process-webhook";

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

async function fetchTxBySignature(apiKey: string, signature: string) {
  const url = new URL("https://api.helius.xyz/v0/transactions");
  url.searchParams.set("api-key", apiKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([signature]),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Helius parse failed (${response.status}): ${await response.text()}`);
  }
  const txs = (await response.json()) as unknown[];
  if (!txs[0]) {
    throw new Error(`No parsed transaction for signature ${signature}`);
  }
  return txs;
}

async function fetchRecentByMint(apiKey: string, mint: string, type?: string) {
  const url = new URL(`https://api.helius.xyz/v0/addresses/${mint}/transactions`);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("limit", "10");
  if (type) {
    url.searchParams.set("type", type);
  }
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Helius history failed (${response.status}): ${await response.text()}`);
  }
  const txs = await response.json();
  if (!Array.isArray(txs) || txs.length === 0) {
    throw new Error(`No transactions found for mint ${mint}`);
  }
  return txs;
}

async function main(): Promise<void> {
  const apiKey = process.env.HELIUS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("HELIUS_API_KEY is required");
  }

  const signature = getArg("--sig");
  const mint = getArg("--mint");
  const type = getArg("--type");

  if (!signature && !mint) {
    throw new Error("Provide --sig <signature> or --mint <mint>");
  }

  const payload = signature
    ? await fetchTxBySignature(apiKey, signature)
    : await fetchRecentByMint(apiKey, mint!, type);

  const result = await processHeliusActivityPayload(payload);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});

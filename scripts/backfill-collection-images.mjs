/**
 * Fill collection_assets.image from json_uri when DAS left image null
 * (common for A.I. BitBots / Arweave metadata).
 *
 * Usage: node scripts/backfill-collection-images.mjs [collection-id]
 */
import { readFileSync } from "node:fs";
import { Pool } from "pg";

function loadEnvFile(path = ".env") {
  try {
    const contents = readFileSync(path, "utf8");
    for (const line of contents.split("\n")) {
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
    // optional
  }
}

function normalizeImageUrl(url) {
  const trimmed = url.trim();
  if (trimmed.startsWith("ipfs://")) {
    return `https://gateway.pinata.cloud/ipfs/${trimmed.slice("ipfs://".length)}`;
  }
  return trimmed;
}

function absoluteRedirectUrl(current, location) {
  if (location.startsWith("//")) return `https:${location}`;
  if (location.startsWith("/")) return new URL(location, current).href;
  return location;
}

async function redirectUrlFromResponse(current, response) {
  const header = response.headers.get("location");
  if (header) return absoluteRedirectUrl(current, header);
  try {
    const text = await response.text();
    let fromJson = text;
    try {
      const payload = JSON.parse(text);
      if (typeof payload.body === "string") fromJson = payload.body;
    } catch {
      // plain text redirect body
    }
    const match = fromJson.match(/\/\/[^\s"'<>]+/);
    return match ? absoluteRedirectUrl(current, match[0]) : null;
  } catch {
    return null;
  }
}

async function fetchFollowingRedirects(url, init) {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, { ...init, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) {
      return { response, finalUrl: current };
    }
    const next = await redirectUrlFromResponse(current, response);
    if (!next) return { response, finalUrl: current };
    current = next;
  }
  throw new Error(`Too many redirects for ${url}`);
}

async function canonicalizeMediaUrl(url) {
  if (!/^https:\/\/arweave\.net\//i.test(url)) return url;
  try {
    const { finalUrl } = await fetchFollowingRedirects(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "*/*" },
    });
    return finalUrl || url;
  } catch {
    return url;
  }
}

async function fetchImage(jsonUri) {
  const candidates = [jsonUri];
  if (jsonUri.startsWith("https://arweave.net/")) {
    const id = jsonUri.slice("https://arweave.net/".length).split(/[/?#]/)[0];
    if (id) candidates.push(`https://arweave.dev/${id}`);
  }
  for (const url of candidates) {
    try {
      const { response } = await fetchFollowingRedirects(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: "*/*" },
      });
      if (!response.ok) continue;
      const metadata = await response.json();
      if (typeof metadata.image === "string" && metadata.image.trim()) {
        return canonicalizeMediaUrl(normalizeImageUrl(metadata.image));
      }
    } catch {
      // next
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

loadEnvFile();
const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("POSTGRES_URL is not set");
  process.exit(1);
}

const onlyId = process.argv[2] ?? "ai-bitbots";
const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

const { rows } = await pool.query(
  `SELECT mint, name, json_uri
   FROM collection_assets
   WHERE collection_id = $1
     AND json_uri IS NOT NULL
     AND (image IS NULL OR image = '')
   ORDER BY name`,
  [onlyId],
);

console.log(`[images] ${onlyId}: ${rows.length} rows missing image`);
let filled = 0;
let failed = 0;
for (const row of rows) {
  const image = await fetchImage(row.json_uri);
  if (!image) {
    failed += 1;
    console.warn(`[images] fail ${row.name}`);
    await sleep(150);
    continue;
  }
  await pool.query(
    `UPDATE collection_assets SET image = $1, updated_at = now() WHERE mint = $2`,
    [image, row.mint],
  );
  filled += 1;
  if (filled % 20 === 0) {
    console.log(`[images] filled ${filled}/${rows.length}`);
  }
  await sleep(80);
}

console.log(`[images] done filled=${filled} failed=${failed}`);
await pool.end();

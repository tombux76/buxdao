/**
 * Fetch HowRare only_rarity for BUXDAO ranked collections and upsert into Postgres.
 * Usage: node scripts/seed-howrare-cache.mjs [collection-id]
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

const SLUGS = {
  "fcked-catz": "fckedcatz",
  "money-monsters": "moneymonsters",
  "money-monsters-3d": "moneymonsters3d",
};

loadEnvFile();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("POSTGRES_URL is not set");
  process.exit(1);
}

const onlyId = process.argv[2];
const ids = onlyId ? [onlyId] : Object.keys(SLUGS);

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS howrare_rank_cache (
      collection_id TEXT NOT NULL,
      token_number INTEGER NOT NULL,
      mint TEXT NOT NULL,
      rank INTEGER NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      rank_algo TEXT NOT NULL DEFAULT 'howrare.is',
      all_ranks JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (collection_id, token_number)
    )
  `);
}

async function seedCollection(collectionId) {
  const slug = SLUGS[collectionId];
  if (!slug) {
    throw new Error(`Unknown collection: ${collectionId}`);
  }
  const started = Date.now();
  console.log(`[howrare] fetching ${collectionId} (${slug})...`);
  const response = await fetch(
    `https://api.howrare.is/v0.1/collections/${slug}/only_rarity`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "BUXDAO/2.0 (seed-howrare-cache)",
      },
      signal: AbortSignal.timeout(60_000),
    },
  );
  if (!response.ok) {
    throw new Error(`HowRare HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (payload?.result?.api_code !== 200) {
    throw new Error("HowRare unexpected response");
  }
  const items = [];
  for (const item of payload.result?.data?.items ?? []) {
    const number = Number.parseInt(String(item.id), 10);
    if (!item.mint || !Number.isFinite(item.rank) || !Number.isFinite(number) || number <= 0) {
      continue;
    }
    items.push({
      number,
      mint: item.mint,
      rank: item.rank,
      link: item.link ?? "",
      rankAlgo: item.rank_algo ?? "howrare.is",
      allRanks: item.all_ranks ?? { "howrare.is": item.rank },
    });
  }
  console.log(
    `[howrare] ${collectionId}: ${items.length} items in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM howrare_rank_cache WHERE collection_id = $1`, [
      collectionId,
    ]);
    const chunkSize = 200;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const values = [];
      const params = [];
      for (const item of chunk) {
        const offset = params.length;
        values.push(
          `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb)`,
        );
        params.push(
          collectionId,
          item.number,
          item.mint,
          item.rank,
          item.link,
          item.rankAlgo,
          JSON.stringify(item.allRanks),
        );
      }
      await client.query(
        `INSERT INTO howrare_rank_cache
           (collection_id, token_number, mint, rank, link, rank_algo, all_ranks)
         VALUES ${values.join(", ")}`,
        params,
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  // Spot-check Fcked Catz cases from Discord failures
  if (collectionId === "fcked-catz") {
    const { rows: byNum } = await pool.query(
      `SELECT token_number, mint, rank FROM howrare_rank_cache
       WHERE collection_id = $1 AND token_number = 36`,
      [collectionId],
    );
    const { rows: byRank } = await pool.query(
      `SELECT token_number, mint, rank FROM howrare_rank_cache
       WHERE collection_id = $1 AND rank = 1`,
      [collectionId],
    );
    console.log("[howrare] spot-check #36:", byNum[0] ?? null);
    console.log("[howrare] spot-check rank #1:", byRank[0] ?? null);
  }
}

try {
  await ensureTable();
  for (const id of ids) {
    await seedCollection(id);
  }
  console.log("[howrare] done");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

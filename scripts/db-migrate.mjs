/**
 * Run SQL migration files using POSTGRES_URL from .env (no shell export needed).
 * Usage: node scripts/db-migrate.mjs db/migrations/20250613_users_x_link.sql
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
    // .env optional if vars already exported
  }
}

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: node scripts/db-migrate.mjs <path-to.sql>");
  process.exit(1);
}

loadEnvFile();

const connectionString = process.env.POSTGRES_URL;
if (!connectionString) {
  console.error("POSTGRES_URL is not set. Add it to .env or export it in your shell.");
  process.exit(1);
}

const sqlPath = resolve(fileArg);
const sql = readFileSync(sqlPath, "utf8");

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
});

try {
  await pool.query(sql);
  console.log(`Applied migration: ${fileArg}`);
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}

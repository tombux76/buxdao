/**
 * Admin: clear unclaimed casino balance after verified on-chain collect.
 * Usage: node scripts/clear-collect-db.mjs --wallet <addr> [--game slots] [--signature <tx>]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { getSql } = require("../casino-api/slots-helpers.cjs");

function loadEnv(path = ".env") {
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
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

loadEnv();
const args = parseArgs(process.argv.slice(2));
const wallet = args.wallet;
const gameType = String(args.game || "slots").toLowerCase();
const signature = args.signature || null;

if (!wallet) {
  console.error("Usage: node scripts/clear-collect-db.mjs --wallet <addr> [--game slots] [--signature <tx>]");
  process.exit(1);
}

const sql = getSql();
if (!sql) {
  console.error("Database not configured");
  process.exit(1);
}

await sql`
  CREATE TABLE IF NOT EXISTS casino_used_collect_signatures (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    game_type TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
  )
`;

if (gameType === "coinflip") {
  await sql`UPDATE coinflip_players SET unclaimed_rewards = 0 WHERE wallet_address = ${wallet} AND token_used = 'bux'`;
} else if (gameType === "roulette") {
  await sql`UPDATE roulette_players SET unclaimed_rewards = 0, chips_balance = 0 WHERE wallet_address = ${wallet} AND token_used = 'bux'`;
} else {
  await sql`UPDATE slots_players SET unclaimed_rewards = 0 WHERE wallet_address = ${wallet} AND token_used = 'bux'`;
}

await sql`
  DELETE FROM casino_pending_collects
  WHERE wallet_address = ${wallet} AND game_type = ${gameType} AND token_used = 'bux'
`;

if (signature) {
  await sql`
    INSERT INTO casino_used_collect_signatures (signature, wallet_address, game_type)
    VALUES (${signature}, ${wallet}, ${gameType})
    ON CONFLICT (signature) DO NOTHING
  `;
}

console.log(JSON.stringify({ ok: true, wallet, gameType, signature }, null, 2));

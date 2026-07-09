/**
 * Release a stuck casino_pending_collects lock (no balance changes).
 * Usage: node scripts/release-collect-lock.mjs --wallet <addr> [--game coinflip]
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { releaseCollectLock } = require("../casino-api/collect-lock.cjs");

function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 0) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if (!(k in process.env)) process.env[k] = v;
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
const gameType = String(args.game || "coinflip").toLowerCase();

if (!wallet) {
  console.error("Usage: node scripts/release-collect-lock.mjs --wallet <addr> [--game coinflip]");
  process.exit(1);
}

await releaseCollectLock(wallet, gameType, "bux");
console.log(JSON.stringify({ ok: true, wallet, gameType }, null, 2));

/**
 * Clear unclaimed casino winnings after a successful on-chain collect tx.
 *
 * Usage:
 *   node scripts/confirm-collect-recovery.mjs \
 *     --wallet AcWwsEwgcEHz6rzUTXcnSksFZbETtc2JhA4jF7PKjp9T \
 *     --signature 676z4e7MQx... \
 *     --amount 9500 \
 *     --game slots
 *
 * Requires POSTGRES_URL, TREASURY_WALLET, BUX_TOKEN_MINT in .env.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler } = require("../casino-api/confirm-collect.cjs");

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
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional if vars already exported
  }
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

loadEnv();

const args = parseArgs(process.argv.slice(2));
const userWallet = args.wallet;
const signature = args.signature;
const amount = Number(args.amount);
const gameType = String(args.game || "slots").toLowerCase();

if (!userWallet || !signature || !Number.isFinite(amount) || amount <= 0) {
  console.error(
    "Usage: node scripts/confirm-collect-recovery.mjs --wallet <addr> --signature <tx> --amount <bux> [--game slots|coinflip|roulette]",
  );
  process.exit(1);
}

if (!process.env.POSTGRES_URL && !process.env.CASINO_DATABASE_URL) {
  console.error("POSTGRES_URL is not set. Add it to .env or export it in your shell.");
  process.exit(1);
}

const req = {
  method: "POST",
  body: {
    userWallet,
    signature,
    amount,
    gameType,
    token: "bux",
  },
  headers: { origin: "http://localhost:3000" },
};

const res = {
  statusCode: 200,
  headers: {},
  setHeader(name, value) {
    this.headers[name] = value;
  },
  end(payload) {
    if (payload) {
      try {
        console.log(JSON.stringify(JSON.parse(payload), null, 2));
      } catch {
        console.log(payload);
      }
    }
    process.exit(this.statusCode >= 200 && this.statusCode < 300 ? 0 : 1);
  },
};

await handler(req, res);

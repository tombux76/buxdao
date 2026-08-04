/**
 * Credit a slots purchase from the terminal (verifies on-chain, then updates DB).
 *
 * Usage:
 *   node scripts/credit-slots-purchase.mjs \
 *     --wallet AcWwsEwgcEHz6rzUTXcnSksFZbETtc2JhA4jF7PKjp9T \
 *     --signature 656oGVSk... \
 *     --spins 10 \
 *     --cost 100
 *
 * Requires POSTGRES_URL (and TREASURY_WALLET, BUX_TOKEN_MINT) in .env.
 * Uses SOLANA_RPC_URL / NEXT_PUBLIC_SOLANA_RPC_URL for on-chain verification.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { handler } = require("../casino-api/save-game.cjs");

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
const wallet = args.wallet;
const signature = args.signature;
const spins = Number.parseInt(String(args.spins ?? "10"), 10);
const cost = Number.parseInt(String(args.cost ?? "100"), 10);

if (!wallet || !signature) {
  console.error(
    "Usage: node scripts/credit-slots-purchase.mjs --wallet <addr> --signature <tx> [--spins 10] [--cost 100]",
  );
  process.exit(1);
}

if (!process.env.POSTGRES_URL && !process.env.CASINO_DATABASE_URL) {
  console.error("POSTGRES_URL is not set. Add it to .env or export it in your shell.");
  process.exit(1);
}

const body = {
  walletAddress: wallet,
  spinCost: cost,
  spinsPurchased: spins,
  purchaseSignature: signature,
  gameType: "slots",
  tokenUsed: "bux",
  resultSymbols: [],
  wonAmount: 0,
};

const req = {
  method: "POST",
  body,
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

/**
 * Local one-off legacy $BUX airdrop runner.
 *
 * Usage:
 *   node scripts/legacy-airdrop.mjs --status
 *   node scripts/legacy-airdrop.mjs --dry-run
 *   node scripts/legacy-airdrop.mjs --wallet <ADDRESS>   # single payout
 *   node scripts/legacy-airdrop.mjs --all                  # all pending
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import bs58 from "bs58";
import {
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getAccount,
  getAssociatedTokenAddress,
} from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction } from "@solana/web3.js";

const ROOT = process.cwd();
const CSV_PATH = join(ROOT, "docs/legacy-unclaimed-by-wallet.csv");
const CLAIMS_PATH = join(ROOT, "data/legacy-claims.json");

function loadEnvFile(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
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

function loadKeypair(secret) {
  if (secret.startsWith("[")) {
    const bytes = JSON.parse(secret);
    return Keypair.fromSecretKey(Uint8Array.from(bytes));
  }
  const decoded = bs58.decode(secret);
  return Keypair.fromSecretKey(decoded);
}

function getRpcCandidates() {
  const urls = [];
  const add = (value) => {
    const url = value?.trim();
    if (url) urls.push(url.replace(/\/$/, ""));
  };

  add(process.env.SOLANA_RPC_URL);
  if (process.env.HELIUS_API_KEY?.trim()) {
    urls.push(
      `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(process.env.HELIUS_API_KEY.trim())}`,
    );
  }
  add(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  urls.push("https://api.mainnet-beta.solana.com");

  return [...new Set(urls)];
}

function maskRpcUrl(url) {
  return url.replace(/api-key=[^&]+/, "api-key=***");
}

async function createWorkingConnection() {
  const candidates = getRpcCandidates();
  let lastError;

  for (const url of candidates) {
    try {
      const connection = new Connection(url, {
        commitment: "confirmed",
        confirmTransactionInitialTimeout: 120_000,
      });
      await connection.getLatestBlockhash("confirmed");
      console.log(`RPC: ${maskRpcUrl(url)}\n`);
      return { connection, url };
    } catch (error) {
      lastError = error;
      console.warn(`RPC unavailable (${maskRpcUrl(url)}): ${error.message ?? error}`);
    }
  }

  throw new Error(
    `No working Solana RPC — tried ${candidates.length} endpoint(s). Last error: ${lastError?.message ?? lastError}`,
  );
}

async function withRetry(label, fn, attempts = 4) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts - 1) break;
      const waitMs = 2000 * (attempt + 1);
      console.warn(`  ${label} failed — retry ${attempt + 1}/${attempts - 1} in ${waitMs}ms…`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

function readPayoutList() {
  const lines = readFileSync(CSV_PATH, "utf8").trim().split("\n").slice(1);
  const payouts = [];
  for (const line of lines) {
    const [walletAddress, totalUnclaimed] = line.split(",");
    const amountBux = Number.parseInt(totalUnclaimed ?? "0", 10) || 0;
    if (!walletAddress?.trim() || amountBux <= 0) continue;
    payouts.push({
      walletAddress: new PublicKey(walletAddress.trim()).toBase58(),
      amountBux,
    });
  }
  return payouts;
}

function readClaims() {
  try {
    const raw = readFileSync(CLAIMS_PATH, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveClaim(walletAddress, record) {
  const claims = readClaims();
  claims[walletAddress] = record;
  mkdirSync(dirname(CLAIMS_PATH), { recursive: true });
  writeFileSync(CLAIMS_PATH, `${JSON.stringify(claims, null, 2)}\n`, "utf8");
}

async function sendBux(connection, senderKeypair, recipientWallet, amountBux) {
  const mint = new PublicKey(process.env.BUX_TOKEN_MINT.trim());
  const decimals = Number.parseInt(process.env.BUX_TOKEN_DECIMALS ?? "9", 10);
  const recipient = new PublicKey(recipientWallet);
  const sender = senderKeypair.publicKey;

  const recipientAta = await getAssociatedTokenAddress(mint, recipient);
  const senderAta = await getAssociatedTokenAddress(mint, sender);
  const rawAmount = BigInt(amountBux) * BigInt(10 ** decimals);

  const senderAccount = await withRetry("load sender token account", () =>
    getAccount(connection, senderAta),
  );
  if (senderAccount.amount < rawAmount) {
    throw new Error(`Insufficient $BUX (need ${amountBux.toLocaleString()})`);
  }

  const transaction = new Transaction();
  try {
    await withRetry("check recipient token account", () => getAccount(connection, recipientAta));
  } catch {
    transaction.add(
      createAssociatedTokenAccountInstruction(sender, recipientAta, recipient, mint),
    );
  }
  transaction.add(createTransferInstruction(senderAta, recipientAta, sender, rawAmount));

  const { blockhash, lastValidBlockHeight } = await withRetry("fetch blockhash", () =>
    connection.getLatestBlockhash("confirmed"),
  );
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sender;
  transaction.sign(senderKeypair);

  const signature = await withRetry("broadcast transaction", async () => {
    const sig = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const confirmation = await connection.confirmTransaction(
      { signature: sig, blockhash, lastValidBlockHeight },
      "confirmed",
    );
    if (confirmation.value.err) throw new Error("On-chain transfer failed");
    return sig;
  });

  return signature;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printStatus(payouts, claims) {
  const pending = payouts.filter((p) => !claims[p.walletAddress]);
  const claimed = payouts.filter((p) => claims[p.walletAddress]);
  const pendingTotal = pending.reduce((s, p) => s + p.amountBux, 0);
  const claimedTotal = claimed.reduce((s, p) => s + p.amountBux, 0);

  console.log(`Total in CSV:     ${payouts.length} wallets`);
  console.log(`Already sent:     ${claimed.length} (${claimedTotal.toLocaleString()} BUX)`);
  console.log(`Still pending:    ${pending.length} (${pendingTotal.toLocaleString()} BUX)`);
}

async function runPayouts({ dryRun, walletFilter, runAll }) {
  loadEnvFile();

  const senderWallet =
    process.env.LEGACY_AIRDROP_WALLET?.trim() || process.env.TREASURY_WALLET?.trim();
  const senderPrivateKey =
    process.env.LEGACY_AIRDROP_PRIVATE_KEY?.trim() || process.env.TREASURY_PRIVATE_KEY?.trim();

  if (!process.env.BUX_TOKEN_MINT?.trim()) {
    throw new Error("BUX_TOKEN_MINT not set in .env");
  }
  if (!senderWallet || !senderPrivateKey) {
    throw new Error("LEGACY_AIRDROP_WALLET / LEGACY_AIRDROP_PRIVATE_KEY not set in .env");
  }

  const senderKeypair = loadKeypair(senderPrivateKey);
  if (senderKeypair.publicKey.toBase58() !== senderWallet) {
    throw new Error("Private key does not match LEGACY_AIRDROP_WALLET");
  }

  const payouts = readPayoutList();
  const claims = readClaims();

  let queue = payouts.filter((p) => !claims[p.walletAddress]);

  if (walletFilter) {
    const target = new PublicKey(walletFilter).toBase58();
    queue = queue.filter((p) => p.walletAddress === target);
    if (queue.length === 0) {
      const inCsv = payouts.find((p) => p.walletAddress === target);
      if (!inCsv) throw new Error("Wallet not in payout CSV");
      if (claims[target]) throw new Error("Wallet already paid — see data/legacy-claims.json");
      throw new Error("Nothing to send for this wallet");
    }
  } else if (!runAll) {
    throw new Error("Pass --wallet <ADDRESS> or --all");
  }

  console.log(`Sender: ${senderWallet}`);
  printStatus(payouts, claims);
  console.log(`\nQueue: ${queue.length} transfer(s)\n`);

  if (dryRun) {
    for (const p of queue) {
      console.log(`  ${p.walletAddress}  →  ${p.amountBux.toLocaleString()} BUX`);
    }
    return;
  }

  const { connection } = await createWorkingConnection();

  for (let i = 0; i < queue.length; i++) {
    const { walletAddress, amountBux } = queue[i];
    console.log(`[${i + 1}/${queue.length}] ${walletAddress}  ${amountBux.toLocaleString()} BUX`);

    const signature = await sendBux(connection, senderKeypair, walletAddress, amountBux);
    saveClaim(walletAddress, {
      amountBux,
      walletAddress,
      txSignature: signature,
      claimedAt: new Date().toISOString(),
    });

    console.log(`  ✓ https://solscan.io/tx/${signature}`);

    if (i < queue.length - 1) await sleep(1500);
  }

  console.log("\nDone.");
  printStatus(payouts, readClaims());
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const statusOnly = args.includes("--status");
const runAll = args.includes("--all");
const walletIdx = args.indexOf("--wallet");
const walletFilter = walletIdx >= 0 ? args[walletIdx + 1] : undefined;

if (statusOnly) {
  loadEnvFile();
  printStatus(readPayoutList(), readClaims());
  process.exit(0);
}

runPayouts({ dryRun, walletFilter, runAll }).catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});

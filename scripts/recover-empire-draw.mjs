/**
 * Finalize an EMPIRE draw after a successful on-chain transfer when
 * /api/empire-draw/confirm failed (e.g. Neon quota).
 *
 * Usage:
 *   npx tsx scripts/recover-empire-draw.mjs \
 *     --signature G6FDuVJ2wQ6bjVQKcMkkZUL2pdTVBTibdKrteLfC9sPBekE2n5LtwS2A2zgUdYh3Bw9szML6Mq2wY142CHaYNNf
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { PublicKey, Connection } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import pg from "pg";

const SIG =
  process.argv.find((a) => a.startsWith("--signature="))?.slice("--signature=".length) ||
  process.argv[process.argv.indexOf("--signature") + 1] ||
  "G6FDuVJ2wQ6bjVQKcMkkZUL2pdTVBTibdKrteLfC9sPBekE2n5LtwS2A2zgUdYh3Bw9szML6Mq2wY142CHaYNNf";

const EMPIRE_MINT = "EmpirdtfUMfBQXEjnNmTngeimjfizfuSBD3TN9zqzydj";
const PRIZE_WALLET = "AAjb7cAT7C7BRU7ULmXcQRLhTAVxky6m4D8aNC7VJLVk";
const PRIZE_AMOUNT = 50_000;
const PRIZE_DECIMALS = 5;
const AMOUNT_RAW = BigInt(PRIZE_AMOUNT) * 10n ** BigInt(PRIZE_DECIMALS);

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

loadEnv();

function getRpcUrls() {
  const urls = [];
  const add = (url) => {
    const trimmed = url?.trim();
    if (trimmed && !urls.includes(trimmed)) urls.push(trimmed);
  };
  add(process.env.SOLANA_RPC_URL);
  add(process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
  // Prefer public RPC first for recovery — Helius keys are often rate-limited.
  add("https://api.mainnet-beta.solana.com");
  for (const keyName of [
    "HELIUS_API_KEY",
    "HELIUS_API_KEY_2",
    "HELIUS_API_KEY_3",
    "HELIUS_API_KEY_4",
    "HELIUS_API_KEY_5",
  ]) {
    const key = process.env[keyName]?.trim();
    if (key) add(`https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}`);
  }
  return urls;
}

async function getParsedTransactionWithFailover(signature) {
  let lastError = null;
  for (const url of getRpcUrls()) {
    try {
      const connection = new Connection(url, {
        commitment: "confirmed",
        fetch: async (input, init) => {
          const response = await fetch(input, {
            ...init,
            signal: AbortSignal.timeout(12_000),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response;
        },
      });
      const tx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      });
      if (tx?.meta) return tx;
      lastError = new Error("Transaction not found yet");
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`RPC failed (${new URL(url).host}): ${lastError.message}`);
    }
  }
  throw lastError ?? new Error("Transaction not found or failed on-chain");
}

async function resolveRecipientWalletFromTx(signature) {
  const tx = await getParsedTransactionWithFailover(signature);
  if (!tx?.meta || tx.meta.err) {
    throw new Error("Transaction not found or failed on-chain");
  }

  const feePayer = tx.transaction.message.accountKeys[0];
  const feePayerAddress =
    typeof feePayer === "object" && feePayer !== null && "pubkey" in feePayer
      ? feePayer.pubkey.toBase58()
      : String(feePayer);
  if (feePayerAddress !== PRIZE_WALLET) {
    throw new Error(`Fee payer ${feePayerAddress} is not prize wallet`);
  }

  // Prefer explicit transfer instruction destination ATA owner
  const allInstructions = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((b) => b.instructions),
  ];

  for (const ix of allInstructions) {
    if (!("parsed" in ix) || !ix.parsed) continue;
    const parsed = ix.parsed;
    if (parsed.type !== "transfer" && parsed.type !== "transferChecked") continue;
    const info = parsed.info || {};
    const amount =
      info.tokenAmount?.amount != null
        ? BigInt(info.tokenAmount.amount)
        : info.amount != null
          ? BigInt(info.amount)
          : null;
    if (amount !== AMOUNT_RAW) continue;
    const destAta = String(info.destination ?? "");
    if (!destAta) continue;

    // Map ATA -> owner from postTokenBalances
    for (const bal of tx.meta.postTokenBalances ?? []) {
      if (bal.mint !== EMPIRE_MINT) continue;
      const accountKey = tx.transaction.message.accountKeys[bal.accountIndex];
      const account =
        typeof accountKey === "object" && accountKey !== null && "pubkey" in accountKey
          ? accountKey.pubkey.toBase58()
          : String(accountKey);
      if (account === destAta && bal.owner) {
        return bal.owner;
      }
    }
  }

  // Fallback: owner who gained exactly AMOUNT_RAW
  const pre = tx.meta.preTokenBalances ?? [];
  const post = tx.meta.postTokenBalances ?? [];
  for (const postBal of post) {
    if (postBal.mint !== EMPIRE_MINT || !postBal.owner) continue;
    const preBal = pre.find(
      (e) => e.accountIndex === postBal.accountIndex && e.mint === EMPIRE_MINT,
    );
    const preAmount = BigInt(preBal?.uiTokenAmount?.amount ?? "0");
    const postAmount = BigInt(postBal.uiTokenAmount?.amount ?? "0");
    if (postAmount - preAmount === AMOUNT_RAW) {
      return postBal.owner;
    }
  }

  throw new Error("Could not resolve recipient wallet from transaction");
}

async function postDiscordAnnouncement(params) {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  const channelId = "948254981327290408";
  if (!token) {
    console.warn("DISCORD_BOT_TOKEN missing — skipping announcement");
    return;
  }

  const usdLine =
    params.prizeUsdValue != null ? ` (~$${Number(params.prizeUsdValue).toFixed(2)} USD)` : "";

  const embed = {
    title: "EMPIRE weekly prize draw — winner",
    description: `**${params.winnerDiscordUsername}** won **${PRIZE_AMOUNT.toLocaleString()} EMPIRE**${usdLine}.`,
    color: 0xf5c542,
    fields: [
      {
        name: "Payout wallet",
        value: `[${params.payoutWallet.slice(0, 4)}…${params.payoutWallet.slice(-4)}](https://solscan.io/account/${params.payoutWallet})`,
        inline: true,
      },
      {
        name: "Eligible pool",
        value: `${params.eligiblePoolSize.toLocaleString()} verified holders`,
        inline: true,
      },
      {
        name: "Transaction",
        value: `[View on Solscan](https://solscan.io/tx/${params.txSignature})`,
        inline: false,
      },
    ],
    footer: { text: "BUXDAO · Omerta Empire City founders bond yield" },
    url: "https://www.buxdao.com/empire-draw",
  };

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: "@everyone",
      embeds: [embed],
      allowed_mentions: { parse: ["everyone"] },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord announcement failed (${response.status}): ${body.slice(0, 300)}`);
  }
  console.log("Discord announcement posted (@everyone)");
}

async function main() {
  const dbUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || process.env.CASINO_DATABASE_URL;
  if (!dbUrl) throw new Error("POSTGRES_URL required");

  console.log("Resolving recipient from tx…", SIG);
  const payoutWallet = await resolveRecipientWalletFromTx(SIG);
  console.log("Recipient wallet:", payoutWallet);

  const pool = new pg.Pool({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

  try {
    const existing = await pool.query(`SELECT id FROM prize_draws WHERE tx_signature = $1`, [SIG]);
    if (existing.rows[0]) {
      console.log("Already recorded as prize_draws id", existing.rows[0].id);
      console.log("Posting Discord announcement only…");
      const row = await pool.query(
        `SELECT winner_discord_username, payout_wallet, eligible_pool_size, prize_usd_value
         FROM prize_draws WHERE tx_signature = $1`,
        [SIG],
      );
      const d = row.rows[0];
      await postDiscordAnnouncement({
        winnerDiscordUsername: d.winner_discord_username || payoutWallet,
        payoutWallet: d.payout_wallet,
        prizeUsdValue: d.prize_usd_value,
        txSignature: SIG,
        eligiblePoolSize: d.eligible_pool_size,
      });
      return;
    }

    const pending = await pool.query(
      `SELECT * FROM prize_draw_pending WHERE payout_wallet = $1 ORDER BY created_at DESC LIMIT 1`,
      [payoutWallet],
    );

    let winnerUserId;
    let winnerDiscordId = null;
    let winnerDiscordUsername = null;
    let winnerDiscordImage = null;
    let eligiblePoolSize = 0;
    let drawnByUserId;

    if (pending.rows[0]) {
      const p = pending.rows[0];
      console.log("Matched pending draw for payout wallet");
      winnerUserId = p.winner_user_id;
      winnerDiscordId = p.winner_discord_id;
      winnerDiscordUsername = p.winner_discord_username;
      winnerDiscordImage = p.winner_discord_image;
      eligiblePoolSize = p.eligible_pool_size;
      drawnByUserId = p.prepared_by_user_id;
    } else {
      console.log("No pending row — looking up wallet link…");
      const walletRow = await pool.query(
        `SELECT uw.user_id, u.discord_id, u.discord_username, u.discord_image
         FROM user_wallets uw
         JOIN users u ON u.id = uw.user_id
         WHERE uw.wallet_address = $1
         LIMIT 1`,
        [payoutWallet],
      );
      if (!walletRow.rows[0]) {
        throw new Error(`No linked user for wallet ${payoutWallet}`);
      }
      const u = walletRow.rows[0];
      winnerUserId = u.user_id;
      winnerDiscordId = u.discord_id;
      winnerDiscordUsername = u.discord_username;
      winnerDiscordImage = u.discord_image;
      eligiblePoolSize = Number(
        (await pool.query(`SELECT COUNT(*)::int AS c FROM user_wallets`)).rows[0]?.c ?? 0,
      );
      // Prefer Tom / prize operator as drawn_by if pending missing — use any admin-ish user:
      // fall back to winner user id for FK constraint
      drawnByUserId = winnerUserId;
      console.log("Recovered winner from user_wallets:", winnerDiscordUsername);
    }

    let prizeUsdValue = null;
    let empireUsdPrice = null;
    try {
      const priceRes = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${EMPIRE_MINT}`,
      );
      if (priceRes.ok) {
        const data = await priceRes.json();
        const pair = data.pairs?.[0];
        if (pair?.priceUsd) {
          empireUsdPrice = Number(pair.priceUsd);
          prizeUsdValue = PRIZE_AMOUNT * empireUsdPrice;
        }
      }
    } catch {
      // optional
    }

    const client = await pool.connect();
    let drawId;
    try {
      await client.query("BEGIN");
      const inserted = await client.query(
        `INSERT INTO prize_draws (
           winner_user_id, winner_discord_id, winner_discord_username, winner_discord_image,
           payout_wallet, prize_amount_raw, empire_usd_price, prize_usd_value, tx_signature,
           eligible_pool_size, drawn_by_user_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          winnerUserId,
          winnerDiscordId,
          winnerDiscordUsername,
          winnerDiscordImage,
          payoutWallet,
          AMOUNT_RAW.toString(),
          empireUsdPrice,
          prizeUsdValue,
          SIG,
          eligiblePoolSize,
          drawnByUserId,
        ],
      );
      drawId = inserted.rows[0].id;
      await client.query(`DELETE FROM prize_draw_pending WHERE payout_wallet = $1`, [payoutWallet]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    console.log("Recorded prize_draws id", drawId);

    await postDiscordAnnouncement({
      winnerDiscordUsername: winnerDiscordUsername || payoutWallet,
      payoutWallet,
      prizeUsdValue,
      txSignature: SIG,
      eligiblePoolSize,
    });

    console.log("Recovery complete.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

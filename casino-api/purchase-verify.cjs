// Verify on-chain BUX purchase txs before crediting spins/flips/chips.
const { PublicKey } = require("@solana/web3.js");
const { getAssociatedTokenAddress } = require("@solana/spl-token");
const { getSql } = require("./slots-helpers.cjs");
const { getRpcCandidates, sleep, createRpcConnection } = require("./rpc-candidates.cjs");

const MAX_TX_AGE_SEC = 60 * 60 * 24; // 24h
const PARSE_POLL_MS = 2000;
const PARSE_MAX_WAIT_MS = 60_000;

let tableReady = false;

async function getParsedTransactionWithRetry(signature) {
  const commitments = ["confirmed", "finalized"];
  const deadline = Date.now() + PARSE_MAX_WAIT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    for (const url of getRpcCandidates()) {
      try {
        const connection = createRpcConnection(url);
        for (const commitment of commitments) {
          const parsed = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment,
          });
          if (parsed?.meta?.err) {
            throw new Error("Purchase transaction failed on chain");
          }
          if (parsed?.meta) {
            return parsed;
          }
        }
      } catch (error) {
        lastError = error;
      }
    }
    await sleep(PARSE_POLL_MS);
  }

  throw lastError || new Error("Purchase transaction not found on chain");
}

async function ensureSignatureTable(sql) {
  if (tableReady || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS casino_used_tx_signatures (
      signature TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      game_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
  tableReady = true;
}

function getTokenDecimals() {
  return parseInt(process.env.BUX_TOKEN_DECIMALS || "9", 10);
}

async function isSignatureUsed(sql, signature) {
  await ensureSignatureTable(sql);
  const rows = await sql`SELECT signature FROM casino_used_tx_signatures WHERE signature = ${signature}`;
  return rows.length > 0;
}

async function markSignatureUsed(sql, signature, walletAddress, gameType) {
  await ensureSignatureTable(sql);
  await sql`
    INSERT INTO casino_used_tx_signatures (signature, wallet_address, game_type)
    VALUES (${signature}, ${walletAddress}, ${gameType})
    ON CONFLICT (signature) DO NOTHING
  `;
}

function findTokenTransferToTreasury(parsed, { userWallet, treasuryWallet, mint, minAmountRaw }) {
  if (!parsed || parsed.meta?.err) return null;

  const instructions = parsed.transaction?.message?.instructions || [];
  const inner = (parsed.meta?.innerInstructions || []).flatMap((ii) => ii.instructions || []);
  const all = [...instructions, ...inner];

  for (const ix of all) {
    if (ix.program !== "spl-token" && ix.programId !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") continue;
    const parsedIx = ix.parsed;
    if (!parsedIx || parsedIx.type !== "transfer" && parsedIx.type !== "transferChecked") continue;

    const info = parsedIx.info || {};
    const authority = info.authority || info.owner;
    const destination = info.destination;
    const amountRaw = BigInt(info.amount || info.tokenAmount?.amount || "0");

    if (authority !== userWallet) continue;
    if (amountRaw < BigInt(minAmountRaw)) continue;

    if (parsedIx.type === "transferChecked") {
      if (info.mint !== mint) continue;
    }

    return { destination, amountRaw, authority };
  }

  // Fallback: compare balance changes on treasury ATA
  const pre = parsed.meta?.preTokenBalances || [];
  const post = parsed.meta?.postTokenBalances || [];
  for (const postBal of post) {
    if (postBal.mint !== mint) continue;
    if (postBal.owner !== treasuryWallet) continue;
    const preBal = pre.find((p) => p.accountIndex === postBal.accountIndex);
    const preAmt = BigInt(preBal?.uiTokenAmount?.amount || "0");
    const postAmt = BigInt(postBal.uiTokenAmount?.amount || "0");
    const delta = postAmt - preAmt;
    if (delta >= BigInt(minAmountRaw)) {
      const userPre = pre.find((p) => p.owner === userWallet && p.mint === mint);
      const userPost = post.find((p) => p.owner === userWallet && p.mint === mint);
      if (userPre && userPost) {
        const userDelta = BigInt(userPost.uiTokenAmount?.amount || "0") - BigInt(userPre.uiTokenAmount?.amount || "0");
        if (userDelta <= -BigInt(minAmountRaw)) {
          return { amountRaw: delta, authority: userWallet };
        }
      }
    }
  }

  return null;
}

async function verifyPurchaseSignature({
  signature,
  walletAddress,
  gameType,
  expectedTokenAmount,
  recordUsed = true,
}) {
  const sql = getSql();
  if (!sql) throw new Error("Database not configured");

  if (!signature || typeof signature !== "string" || signature.length < 80) {
    throw new Error("Valid purchaseSignature is required");
  }

  if (await isSignatureUsed(sql, signature)) {
    throw new Error("Purchase transaction already used");
  }

  const treasuryWallet = process.env.TREASURY_WALLET;
  const mint = process.env.BUX_TOKEN_MINT;
  if (!treasuryWallet || !mint) {
    throw new Error("Treasury or token mint not configured");
  }

  const decimals = getTokenDecimals();
  const minAmountRaw = BigInt(Math.floor(Number(expectedTokenAmount) * Math.pow(10, decimals)));

  const parsed = await getParsedTransactionWithRetry(signature);

  const blockTime = parsed.blockTime;
  if (blockTime && Date.now() / 1000 - blockTime > MAX_TX_AGE_SEC) {
    throw new Error("Purchase transaction too old");
  }

  const transfer = findTokenTransferToTreasury(parsed, {
    userWallet: walletAddress,
    treasuryWallet,
    mint,
    minAmountRaw,
  });

  if (!transfer) {
    throw new Error("No valid BUX transfer to treasury found in purchase transaction");
  }

  // Verify destination is treasury ATA when possible
  try {
    const treasuryPk = new PublicKey(treasuryWallet);
    const mintPk = new PublicKey(mint);
    const expectedAta = await getAssociatedTokenAddress(mintPk, treasuryPk);
    if (transfer.destination && transfer.destination !== expectedAta.toString()) {
      // Allow if balance-delta path matched treasury owner
      const post = parsed.meta?.postTokenBalances || [];
      const treasuryCredit = post.some(
        (b) => b.owner === treasuryWallet && b.mint === mint
      );
      if (!treasuryCredit) throw new Error("Treasury did not receive purchase tokens");
    }
  } catch (_) {
    // Non-fatal if ATA check fails
  }

  if (recordUsed) {
    await markSignatureUsed(sql, signature, walletAddress, gameType);
  }
  return true;
}

module.exports = { verifyPurchaseSignature, markSignatureUsed, ensureSignatureTable };

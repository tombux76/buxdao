// Prevent parallel collect requests from signing multiple treasury payouts.
const { getSql } = require("./slots-helpers.cjs");

const PENDING_TTL_MINUTES = 15;
/** Locks older than this with no submitted on-chain tx are treated as abandoned. */
const STALE_LOCK_MINUTES = 3;
let tableReady = false;

async function ensurePendingCollectTable(sql) {
  if (tableReady || !sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS casino_pending_collects (
      wallet_address TEXT NOT NULL,
      game_type TEXT NOT NULL,
      token_used TEXT NOT NULL DEFAULT 'bux',
      amount NUMERIC NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      PRIMARY KEY (wallet_address, game_type, token_used)
    )
  `;
  tableReady = true;
}

async function ensureSubmittedCollectTable(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS casino_submitted_collects (
      signature TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      game_type TEXT NOT NULL,
      token_used TEXT NOT NULL DEFAULT 'bux',
      amount NUMERIC NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
}

async function hasSubmittedCollect(sql, walletAddress, gameType, tokenUsed) {
  await ensureSubmittedCollectTable(sql);
  const rows = await sql`
    SELECT signature FROM casino_submitted_collects
    WHERE wallet_address = ${walletAddress}
      AND game_type = ${gameType}
      AND token_used = ${tokenUsed}
      AND created_at > NOW() - INTERVAL '48 hours'
    LIMIT 1
  `;
  return rows.length > 0;
}

async function acquireCollectLock(walletAddress, gameType, tokenUsed, amount) {
  const sql = getSql();
  if (!sql) return { ok: true };

  await ensurePendingCollectTable(sql);
  await sql`
    DELETE FROM casino_pending_collects
    WHERE created_at < NOW() - INTERVAL '15 minutes'
  `;

  const existing = await sql`
    SELECT amount, created_at FROM casino_pending_collects
    WHERE wallet_address = ${walletAddress} AND game_type = ${gameType} AND token_used = ${tokenUsed}
  `;
  if (existing[0]) {
    const createdAt = new Date(existing[0].created_at).getTime();
    const ageMinutes = (Date.now() - createdAt) / 60000;
    const submitted = await hasSubmittedCollect(sql, walletAddress, gameType, tokenUsed);

    if (!submitted && ageMinutes >= STALE_LOCK_MINUTES) {
      await releaseCollectLock(walletAddress, gameType, tokenUsed);
    } else {
      return {
        ok: false,
        error: submitted
          ? "Collect already in progress. Your transaction is being confirmed — please wait."
          : "Collect already in progress. Complete the pending withdrawal or wait a few minutes.",
        pendingAmount: Number(existing[0].amount),
      };
    }
  }

  try {
    await sql`
      INSERT INTO casino_pending_collects (wallet_address, game_type, token_used, amount)
      VALUES (${walletAddress}, ${gameType}, ${tokenUsed}, ${amount})
    `;
    return { ok: true };
  } catch (err) {
    if (String(err.message || err).includes("duplicate") || String(err.code) === "23505") {
      return { ok: false, error: "Collect already in progress" };
    }
    throw err;
  }
}

async function releaseCollectLock(walletAddress, gameType, tokenUsed = "bux") {
  const sql = getSql();
  if (!sql) return;
  await ensurePendingCollectTable(sql);
  await sql`
    DELETE FROM casino_pending_collects
    WHERE wallet_address = ${walletAddress} AND game_type = ${gameType} AND token_used = ${tokenUsed}
  `;
}

module.exports = { acquireCollectLock, releaseCollectLock, ensurePendingCollectTable };

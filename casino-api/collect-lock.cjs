// Prevent parallel collect requests from signing multiple treasury payouts.
const { getSql } = require("./slots-helpers.cjs");

const PENDING_TTL_MINUTES = 15;
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
    return {
      ok: false,
      error: "Collect already in progress. Complete the pending withdrawal or wait a few minutes.",
      pendingAmount: Number(existing[0].amount),
    };
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

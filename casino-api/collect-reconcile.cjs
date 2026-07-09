// Reconcile submitted collect txs so timeouts cannot cause double payouts.
const { verifyCollectPayout } = require("./collect-verify.cjs");
const { releaseCollectLock } = require("./collect-lock.cjs");
const { getSignatureStatusWithFallback } = require("./rpc-candidates.cjs");

const DB_DECIMALS = 6;

async function ensureCollectTables(sql) {
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
  await sql`
    CREATE TABLE IF NOT EXISTS casino_used_collect_signatures (
      signature TEXT PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      game_type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `;
}

async function clearUnclaimedInDb(sql, userWallet, gameType, token) {
  if (gameType === "coinflip") {
    const rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
    const playerData = rows[0];
    if (!playerData) return false;
    const updateResult = await sql`
      UPDATE coinflip_players SET unclaimed_rewards = 0
      WHERE wallet_address = ${userWallet} AND token_used = ${token}
        AND unclaimed_rewards = ${playerData.unclaimed_rewards}
      RETURNING wallet_address
    `;
    return updateResult.length > 0;
  }
  if (gameType === "roulette") {
    const rows = await sql`
      SELECT unclaimed_rewards, chips_balance FROM roulette_players
      WHERE wallet_address = ${userWallet} AND token_used = ${token}
    `;
    const playerData = rows[0];
    if (!playerData) return false;
    const updateResult = await sql`
      UPDATE roulette_players SET unclaimed_rewards = 0, chips_balance = 0
      WHERE wallet_address = ${userWallet} AND token_used = ${token}
        AND (unclaimed_rewards = ${playerData.unclaimed_rewards} OR chips_balance = ${playerData.chips_balance})
      RETURNING wallet_address
    `;
    return updateResult.length > 0;
  }
  const rows = await sql`SELECT unclaimed_rewards FROM slots_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
  const playerData = rows[0];
  if (!playerData) return false;
  const updateResult = await sql`
    UPDATE slots_players SET unclaimed_rewards = 0
    WHERE wallet_address = ${userWallet} AND token_used = ${token}
      AND unclaimed_rewards = ${playerData.unclaimed_rewards}
    RETURNING wallet_address
  `;
  return updateResult.length > 0;
}

async function markCollectSignatureUsed(sql, signature, userWallet, gameType) {
  await sql`
    INSERT INTO casino_used_collect_signatures (signature, wallet_address, game_type)
    VALUES (${signature}, ${userWallet}, ${gameType})
    ON CONFLICT (signature) DO NOTHING
  `;
  await sql`DELETE FROM casino_submitted_collects WHERE signature = ${signature}`;
}

async function tryFinalizeCollectSignature(sql, { userWallet, gameType, token, signature, amount }) {
  const used = await sql`
    SELECT signature FROM casino_used_collect_signatures WHERE signature = ${signature}
  `;
  if (used[0]) {
    return { finalized: true, alreadyRecorded: true };
  }

  const status = await getSignatureStatusWithFallback(signature, { retries: 3, initialWaitMs: 500 });
  if (!status?.value) return { finalized: false, reason: "not_found" };
  if (status.value.err) return { finalized: false, reason: "failed", err: status.value.err };

  await verifyCollectPayout({ signature, userWallet, expectedAmount: amount });
  const cleared = await clearUnclaimedInDb(sql, userWallet, gameType, token);
  await markCollectSignatureUsed(sql, signature, userWallet, gameType);
  await releaseCollectLock(userWallet, gameType, token);
  return { finalized: true, cleared, signature, amount };
}

async function registerSubmittedCollect(sql, { userWallet, gameType, token, signature, amount }) {
  await ensureCollectTables(sql);
  await sql`
    INSERT INTO casino_submitted_collects (signature, wallet_address, game_type, token_used, amount)
    VALUES (${signature}, ${userWallet}, ${gameType}, ${token}, ${amount})
    ON CONFLICT (signature) DO NOTHING
  `;
  return tryFinalizeCollectSignature(sql, { userWallet, gameType, token, signature, amount });
}

async function reconcileSubmittedCollects(sql, userWallet, gameType, token) {
  if (!sql) return { reconciled: false };
  await ensureCollectTables(sql);

  const rows = await sql`
    SELECT signature, amount FROM casino_submitted_collects
    WHERE wallet_address = ${userWallet} AND game_type = ${gameType} AND token_used = ${token}
      AND created_at > NOW() - INTERVAL '48 hours'
    ORDER BY created_at DESC
    LIMIT 10
  `;

  for (const row of rows) {
    try {
      const result = await tryFinalizeCollectSignature(sql, {
        userWallet,
        gameType,
        token,
        signature: row.signature,
        amount: Number(row.amount),
      });
      if (result.finalized) {
        return { reconciled: true, ...result };
      }
    } catch (err) {
      console.warn("Collect reconcile attempt failed:", row.signature, err.message || err);
    }
  }
  return { reconciled: false };
}

async function readDbUnclaimed(sql, userWallet, gameType, token) {
  if (gameType === "coinflip") {
    const rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
    return rows[0] ? Number(rows[0].unclaimed_rewards || 0) / Math.pow(10, DB_DECIMALS) : 0;
  }
  if (gameType === "roulette") {
    const rows = await sql`
      SELECT unclaimed_rewards, chips_balance, cost_per_chip FROM roulette_players
      WHERE wallet_address = ${userWallet} AND token_used = ${token}
    `;
    if (!rows[0]) return 0;
    const unclaimedPart = Number(rows[0].unclaimed_rewards || 0) / Math.pow(10, DB_DECIMALS);
    const chipPart = (rows[0].chips_balance || 0) * (rows[0].cost_per_chip || 100);
    return unclaimedPart + chipPart;
  }
  const rows = await sql`SELECT unclaimed_rewards FROM slots_players WHERE wallet_address = ${userWallet} AND token_used = ${token}`;
  return rows[0] ? Number(rows[0].unclaimed_rewards || 0) / Math.pow(10, DB_DECIMALS) : 0;
}

module.exports = {
  ensureCollectTables,
  registerSubmittedCollect,
  reconcileSubmittedCollects,
  tryFinalizeCollectSignature,
  readDbUnclaimed,
  clearUnclaimedInDb,
  markCollectSignatureUsed,
};

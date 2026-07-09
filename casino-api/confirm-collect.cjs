// Confirm collect: clear unclaimed_rewards after tx confirmed — adapted from xapes, slots only
const { getSql, setCors, json } = require("./slots-helpers.cjs");
const { isValidWalletAddress } = require("./wallet-utils.cjs");
const { verifyCollectPayout } = require("./collect-verify.cjs");
const { releaseCollectLock } = require("./collect-lock.cjs");
const { getSignatureStatusWithFallback } = require("./rpc-candidates.cjs");
const { markCollectSignatureUsed } = require("./collect-reconcile.cjs");

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
  const sql = getSql();
  if (!sql) return json(res, 500, { error: "Database not configured" });

  try {
    const { userWallet, signature, amount: amountRaw, gameType = "slots", token: tokenRaw } = req.body;
    const amount = amountRaw != null ? Number(amountRaw) : NaN;
    const tokenNorm = "bux";
    const gameTypeNorm = (gameType || "slots").toLowerCase();
    if (gameTypeNorm !== "slots" && gameTypeNorm !== "coinflip" && gameTypeNorm !== "roulette") {
      return json(res, 400, { error: "gameType must be slots, coinflip, or roulette" });
    }
    if (!userWallet || !signature || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: "Invalid request: userWallet, signature, and positive amount required" });
    }
    if (!isValidWalletAddress(userWallet)) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }
    if (typeof signature !== "string" || signature.trim().length === 0) {
      return json(res, 400, { error: "Invalid transaction signature format" });
    }
    if (signature.length < 80 || signature.length > 100) {
      return json(res, 400, { error: "Invalid transaction signature format" });
    }

    const status = await getSignatureStatusWithFallback(signature);

    if (!status || !status.value) {
      return json(res, 400, {
        error: "Transaction not found",
        message: "Transaction may still be propagating. Try again in a few seconds.",
        signature,
      });
    }

    if (status.value.err) {
      return json(res, 400, { error: "Transaction failed", transactionError: status.value.err });
    }

    if (!status.value.confirmationStatus || status.value.confirmationStatus === "processed") {
      return json(res, 202, { message: "Transaction still processing", status: "processing" });
    }

    try {
      await verifyCollectPayout({ signature, userWallet, expectedAmount: amount });
    } catch (verifyErr) {
      return json(res, 400, {
        error: "Collect transaction verification failed",
        message: verifyErr.message || String(verifyErr),
      });
    }

    let rows, updateResult;
    if (gameTypeNorm === "coinflip") {
      rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE coinflip_players SET unclaimed_rewards = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND unclaimed_rewards = ${playerData.unclaimed_rewards} RETURNING wallet_address`;
    } else if (gameTypeNorm === "roulette") {
      rows = await sql`SELECT unclaimed_rewards, chips_balance FROM roulette_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE roulette_players SET unclaimed_rewards = 0, chips_balance = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND (unclaimed_rewards = ${playerData.unclaimed_rewards} OR chips_balance = ${playerData.chips_balance}) RETURNING wallet_address`;
    } else {
      rows = await sql`SELECT unclaimed_rewards FROM slots_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE slots_players SET unclaimed_rewards = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND unclaimed_rewards = ${playerData.unclaimed_rewards} RETURNING wallet_address`;
    }

    if (!updateResult || updateResult.length === 0) {
      await releaseCollectLock(userWallet, gameTypeNorm, tokenNorm);
      await markCollectSignatureUsed(sql, signature, userWallet, gameTypeNorm);
      return json(res, 200, { message: "Unclaimed rewards already cleared", alreadyCleared: true });
    }

    await markCollectSignatureUsed(sql, signature, userWallet, gameTypeNorm);
    await releaseCollectLock(userWallet, gameTypeNorm, tokenNorm);

    return json(res, 200, { message: "Unclaimed rewards cleared successfully", amount });
  } catch (err) {
    console.error("Confirm collect error:", err);
    const msg = err.message || String(err);
    return json(res, 500, {
      error: "Failed to confirm collect",
      message: msg.includes("treasury") ? "Could not confirm treasury payout. Please try again or contact support." : msg,
    });
  }
}

module.exports = { handler };

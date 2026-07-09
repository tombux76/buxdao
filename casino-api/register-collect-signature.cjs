const { getSql, setCors, json } = require("./slots-helpers.cjs");
const { isValidWalletAddress } = require("./wallet-utils.cjs");
const { registerSubmittedCollect } = require("./collect-reconcile.cjs");

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { userWallet, signature, amount: amountRaw, gameType = "slots", token: tokenRaw } = req.body || {};
    const amount = amountRaw != null ? Number(amountRaw) : NaN;
    const gameTypeNorm = (gameType || "slots").toLowerCase();
    const token = "bux";

    if (!userWallet || !signature || !Number.isFinite(amount) || amount <= 0) {
      return json(res, 400, { error: "userWallet, signature, and positive amount required" });
    }
    if (!isValidWalletAddress(userWallet)) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }
    if (typeof signature !== "string" || signature.length < 80 || signature.length > 100) {
      return json(res, 400, { error: "Invalid transaction signature format" });
    }

    const sql = getSql();
    if (!sql) return json(res, 500, { error: "Database not configured" });

    const result = await registerSubmittedCollect(sql, {
      userWallet,
      gameType: gameTypeNorm,
      token,
      signature,
      amount,
    });

    return json(res, result.finalized ? 200 : 202, result);
  } catch (err) {
    console.error("Register collect signature error:", err);
    return json(res, 500, { error: "Failed to register collect signature", message: err.message });
  }
}

module.exports = { handler };

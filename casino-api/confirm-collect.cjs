// Confirm collect: clear unclaimed_rewards after tx confirmed — adapted from xapes, slots only
const { Connection, PublicKey } = require("@solana/web3.js");
const { sql, setCors, json } = require("./slots-helpers.cjs");

const TOKEN_DECIMALS = 6;
const HELIUS_RPC = process.env.HELIUS_RPC || "https://mainnet.helius-rpc.com";
const RPC_URL =
  process.env.SLOTS_RPC_URL ||
  (process.env.HELIUS_API_KEY ? HELIUS_RPC + "/?api-key=" + encodeURIComponent(process.env.HELIUS_API_KEY) : HELIUS_RPC + "/");

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });
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
    try {
      new PublicKey(userWallet);
    } catch (_) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }
    if (typeof signature !== "string" || signature.trim().length === 0) {
      return json(res, 400, { error: "Invalid transaction signature format" });
    }
    if (signature.length < 80 || signature.length > 100) {
      return json(res, 400, { error: "Invalid transaction signature format" });
    }

    const connection = new Connection(RPC_URL, "confirmed");
    let status = null;
    let retries = 5;
    let waitTime = 1000;

    while (retries > 0) {
      status = await connection.getSignatureStatus(signature);
      if (status && status.value) break;
      retries--;
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, waitTime));
        waitTime *= 1.5;
      }
    }

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

    let rows, updateResult;
    if (gameTypeNorm === "coinflip") {
      rows = await sql`SELECT unclaimed_rewards FROM coinflip_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE coinflip_players SET unclaimed_rewards = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND unclaimed_rewards = ${playerData.unclaimed_rewards} RETURNING wallet_address`;
    } else if (gameTypeNorm === "roulette") {
      rows = await sql`SELECT unclaimed_rewards FROM roulette_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE roulette_players SET unclaimed_rewards = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND unclaimed_rewards = ${playerData.unclaimed_rewards} RETURNING wallet_address`;
    } else {
      rows = await sql`SELECT unclaimed_rewards FROM slots_players WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm}`;
      const playerData = rows[0];
      if (!playerData) return json(res, 404, { error: "Player not found" });
      updateResult = await sql`UPDATE slots_players SET unclaimed_rewards = 0 WHERE wallet_address = ${userWallet} AND token_used = ${tokenNorm} AND unclaimed_rewards = ${playerData.unclaimed_rewards} RETURNING wallet_address`;
    }

    if (!updateResult || updateResult.length === 0) {
      return json(res, 200, { message: "Unclaimed rewards already cleared", alreadyCleared: true });
    }

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

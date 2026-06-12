// Load slots player state — Neon Postgres
const { sql, setCors, json } = require("./slots-helpers.cjs");

const TOKEN_DECIMALS = 6;

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();

  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  if (!sql) return json(res, 500, { error: "Database not configured" });

  try {
    const walletAddress = req.query.walletAddress;
    const gameType = (req.query.gameType || "slots").toLowerCase();

    if (gameType !== "slots" && gameType !== "coinflip" && gameType !== "roulette") return json(res, 400, { error: "gameType must be slots, coinflip, or roulette" });
    if (!walletAddress) return json(res, 400, { error: "walletAddress query parameter is required" });

    try {
      const { PublicKey } = require("@solana/web3.js");
      new PublicKey(walletAddress);
    } catch (_) {
      return json(res, 400, { error: "Invalid wallet address format" });
    }

    if (gameType === "roulette") {
      const tokenUsed = "bux";
      const rows = await sql`SELECT wallet_address, total_spins, total_won, total_wagered, unclaimed_rewards, chips_balance, cost_per_chip, token_used, created_at
        FROM roulette_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsed}`;
      const player = rows[0];
      if (!player) {
        return json(res, 200, {
          walletAddress,
          totalSpins: 0,
          totalWon: 0,
          totalWagered: 0,
          unclaimedRewards: 0,
          chipsBalance: 0,
          costPerChip: 100,
          tokenUsed: "bux",
          createdAt: null,
        });
      }
      const totalWon = Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
      const totalWagered = Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
      const unclaimedRewards = Number(player.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS);
      return json(res, 200, {
        walletAddress: player.wallet_address,
        totalSpins: player.total_spins || 0,
        totalWon,
        totalWagered,
        unclaimedRewards,
        chipsBalance: player.chips_balance || 0,
        costPerChip: player.cost_per_chip ?? 100,
        tokenUsed: (player.token_used || "bux").toLowerCase(),
        createdAt: player.created_at,
      });
    }

    if (gameType === "coinflip") {
      const tokenUsed = "bux";
      const rows = await sql`SELECT wallet_address, total_flips, total_won, total_wagered, unclaimed_rewards, flips_remaining, cost_per_flip, token_used, created_at
        FROM coinflip_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsed}`;
      const player = rows[0];

      if (!player) {
        return json(res, 200, {
          walletAddress,
          totalFlips: 0,
          totalWon: 0,
          totalWagered: 0,
          unclaimedRewards: 0,
          flipsRemaining: 0,
          costPerFlip: 100,
          tokenUsed: "bux",
          createdAt: null,
        });
      }

      const totalWon = Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
      const totalWagered = Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
      const unclaimedRewards = Number(player.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS);

      return json(res, 200, {
        walletAddress: player.wallet_address,
        totalFlips: player.total_flips || 0,
        totalWon,
        totalWagered,
        unclaimedRewards,
        flipsRemaining: player.flips_remaining || 0,
        costPerFlip: player.cost_per_flip ?? 100,
        tokenUsed: (player.token_used || "bux").toLowerCase(),
        createdAt: player.created_at,
      });
    }

    const tokenUsed = "bux";
    const rows = await sql`SELECT wallet_address, total_spins, total_won, total_wagered, unclaimed_rewards, spins_remaining, cost_per_spin, token_used, created_at
      FROM slots_players WHERE wallet_address = ${walletAddress} AND token_used = ${tokenUsed}`;
    const player = rows[0];

    if (!player) {
      return json(res, 200, {
        walletAddress,
        totalSpins: 0,
        totalWon: 0,
        totalWagered: 0,
        unclaimedRewards: 0,
        spinsRemaining: 0,
        costPerSpin: 100,
        tokenUsed: "bux",
        createdAt: null,
      });
    }

    const totalWon = Number(player.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
    const totalWagered = Number(player.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
    const unclaimedRewards = Number(player.unclaimed_rewards || 0) / Math.pow(10, TOKEN_DECIMALS);

    return json(res, 200, {
      walletAddress: player.wallet_address,
      totalSpins: player.total_spins || 0,
      totalWon,
      totalWagered,
      unclaimedRewards,
      spinsRemaining: player.spins_remaining || 0,
      costPerSpin: player.cost_per_spin ?? 100,
      tokenUsed: (player.token_used || "bux").toLowerCase(),
      createdAt: player.created_at,
    });
  } catch (err) {
    console.error("Load player error:", err);
    return json(res, 500, { error: "Failed to load player data", message: err.message });
  }
}

module.exports = { handler };

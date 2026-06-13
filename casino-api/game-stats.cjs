// Grand totals for slots — Neon Postgres
const { getSql, setCors, json } = require("./slots-helpers.cjs");

const TOKEN_DECIMALS = 6;

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();

  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });
  const sql = getSql();
  if (!sql) return json(res, 500, { error: "Database not configured" });

  const gameType = (req.query.gameType || "slots").toLowerCase();
  if (gameType !== "slots" && gameType !== "coinflip") return json(res, 400, { error: "gameType must be slots or coinflip" });
  const tokenUsed = "bux";

  try {
    if (gameType === "coinflip") {
      const stats = await sql`SELECT total_flips, total_won, total_wagered FROM coinflip_players WHERE token_used = ${tokenUsed}`;
      let grandTotalFlips = 0;
      let grandTotalWon = 0;
      let grandTotalWagered = 0;
      if (stats && stats.length > 0) {
        stats.forEach((p) => {
          grandTotalFlips += p.total_flips || 0;
          grandTotalWon += Number(p.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
          grandTotalWagered += Number(p.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
        });
      }
      return json(res, 200, {
        grandTotalFlips,
        grandTotalWon,
        grandTotalWagered,
        totalPlayers: stats ? stats.length : 0,
      });
    }

    const stats = await sql`SELECT total_spins, total_won, total_wagered FROM slots_players WHERE token_used = ${tokenUsed}`;

    let grandTotalSpins = 0;
    let grandTotalWon = 0;
    let grandTotalWagered = 0;

    if (stats && stats.length > 0) {
      stats.forEach((p) => {
        grandTotalSpins += p.total_spins || 0;
        grandTotalWon += Number(p.total_won || 0) / Math.pow(10, TOKEN_DECIMALS);
        grandTotalWagered += Number(p.total_wagered || 0) / Math.pow(10, TOKEN_DECIMALS);
      });
    }

    return json(res, 200, {
      grandTotalSpins,
      grandTotalWon,
      grandTotalWagered,
      totalPlayers: stats ? stats.length : 0,
    });
  } catch (err) {
    console.error("Game stats error:", err);
    return json(res, 500, { error: "Failed to load game stats", message: err.message });
  }
}

module.exports = { handler };

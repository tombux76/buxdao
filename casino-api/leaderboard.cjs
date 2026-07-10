// Casino leaderboard — Neon Postgres
const { getSql, setCors, json } = require("./slots-helpers.cjs");

const TOKEN_DECIMALS = 6;
const TOKEN_USED = "bux";
const VALID_GAMES = ["all", "slots", "coinflip", "roulette"];
const VALID_SORT = ["winRate", "wagered", "won", "plays"];
const LEGACY_SORT = { spins: "plays", flips: "plays" };

function toBux(raw) {
  return Number(raw || 0) / 10 ** TOKEN_DECIMALS;
}

function formatEntry(row, index) {
  const wallet = row.wallet_address;
  const totalWagered = toBux(row.total_wagered);
  const totalWon = toBux(row.total_won);
  const totalPlays = Number(row.total_plays || 0);
  const winRate = totalWagered > 0 ? (totalWon / totalWagered) * 100 : 0;
  const displayName =
    row.discord_username || `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;

  return {
    rank: index + 1,
    walletAddress: wallet,
    displayName,
    discordUsername: row.discord_username || null,
    discordImage: row.discord_image || null,
    totalPlays,
    totalWagered,
    totalWon,
    winRate,
  };
}

function normalizeSort(sortBy) {
  const mapped = LEGACY_SORT[sortBy] || sortBy;
  return VALID_SORT.includes(mapped) ? mapped : "plays";
}

async function querySingleGame(sql, gameType, sortBy, limit) {
  const configs = {
    slots: { table: "slots_players", playsCol: "total_spins" },
    coinflip: { table: "coinflip_players", playsCol: "total_flips" },
    roulette: { table: "roulette_players", playsCol: "total_spins" },
  };
  const cfg = configs[gameType];
  const orderBy =
    sortBy === "wagered"
      ? "p.total_wagered DESC"
      : sortBy === "won"
        ? "p.total_won DESC"
        : sortBy === "winRate"
          ? "(p.total_won::float / NULLIF(p.total_wagered, 0)) DESC NULLS LAST"
          : `p.${cfg.playsCol} DESC`;

  const query = `
    SELECT p.wallet_address,
           p.${cfg.playsCol} AS total_plays,
           p.total_wagered,
           p.total_won,
           u.discord_username,
           u.discord_image
    FROM ${cfg.table} p
    LEFT JOIN user_wallets uw ON uw.wallet_address = p.wallet_address
    LEFT JOIN users u ON u.id = uw.user_id
    WHERE p.token_used = $1 AND p.${cfg.playsCol} > 0
    ORDER BY ${orderBy}
    LIMIT $2`;

  return sql.query(query, [TOKEN_USED, limit]);
}

async function queryAllGames(sql, sortBy, limit) {
  const orderBy =
    sortBy === "wagered"
      ? "a.total_wagered DESC"
      : sortBy === "won"
        ? "a.total_won DESC"
        : sortBy === "winRate"
          ? "(a.total_won::float / NULLIF(a.total_wagered, 0)) DESC NULLS LAST"
          : "a.total_plays DESC";

  const query = `
    WITH combined AS (
      SELECT wallet_address, total_spins::bigint AS total_plays, total_wagered, total_won
      FROM slots_players
      WHERE token_used = $1 AND total_spins > 0
      UNION ALL
      SELECT wallet_address, total_flips::bigint, total_wagered, total_won
      FROM coinflip_players
      WHERE token_used = $1 AND total_flips > 0
      UNION ALL
      SELECT wallet_address, total_spins::bigint, total_wagered, total_won
      FROM roulette_players
      WHERE token_used = $1 AND total_spins > 0
    ),
    agg AS (
      SELECT wallet_address,
             SUM(total_plays)::bigint AS total_plays,
             SUM(total_wagered) AS total_wagered,
             SUM(total_won) AS total_won
      FROM combined
      GROUP BY wallet_address
      HAVING SUM(total_wagered) > 0
    )
    SELECT a.wallet_address,
           a.total_plays,
           a.total_wagered,
           a.total_won,
           u.discord_username,
           u.discord_image
    FROM agg a
    LEFT JOIN user_wallets uw ON uw.wallet_address = a.wallet_address
    LEFT JOIN users u ON u.id = uw.user_id
    ORDER BY ${orderBy}
    LIMIT $2`;

  return sql.query(query, [TOKEN_USED, limit]);
}

async function handler(req, res) {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.end();
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const sql = getSql();
  if (!sql) return json(res, 500, { error: "Database not configured" });

  const gameType = (req.query.gameType || "all").toLowerCase();
  if (!VALID_GAMES.includes(gameType)) {
    return json(res, 400, { error: `gameType must be one of: ${VALID_GAMES.join(", ")}` });
  }

  const sortBy = normalizeSort(req.query.sortBy || "plays");
  const limit = Math.min(parseInt(req.query.limit, 10) || 100, 1000);

  try {
    const rows =
      gameType === "all"
        ? await queryAllGames(sql, sortBy, limit)
        : await querySingleGame(sql, gameType, sortBy, limit);

    const leaderboard = (rows || []).map(formatEntry);

    return json(res, 200, {
      leaderboard,
      gameType,
      sortBy,
      totalPlayers: leaderboard.length,
    });
  } catch (err) {
    console.error("Leaderboard error:", err);
    return json(res, 500, { error: "Failed to load leaderboard", message: err.message });
  }
}

module.exports = { handler };

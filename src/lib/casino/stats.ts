import { getPool } from "@/lib/db";
import { isWalletLinkedToUser, listLinkedWalletAddresses } from "@/lib/holder-rewards/wallet-auth";

const DECIMALS = 6;

export type GameStat = {
  totalWagered: number;
  totalWon: number;
  winRate: number;
  totalPlays: number;
};

type StatRow = {
  total_plays: number | string;
  total_wagered: string | bigint;
  total_won: string | bigint;
};

function emptyGameStat(): GameStat {
  return { totalWagered: 0, totalWon: 0, winRate: 0, totalPlays: 0 };
}

function aggregateRow(row: StatRow): GameStat {
  const totalWagered = Number(row.total_wagered) / 10 ** DECIMALS;
  const totalWon = Number(row.total_won) / 10 ** DECIMALS;
  const totalPlays = Number(row.total_plays) || 0;
  const winRate = totalWagered > 0 ? (totalWon / totalWagered) * 100 : 0;
  return { totalWagered, totalWon, winRate, totalPlays };
}

export type CasinoMyStats = {
  player: {
    discordUsername: string | null;
    discordImage: string | null;
    displayName: string | null;
    wallets: string[];
  };
  overall: GameStat;
  games: {
    slots: GameStat;
    coinflip: GameStat;
    roulette: GameStat;
  };
};

export async function getCasinoMyStats(
  userId: string,
  walletFilter?: string | null,
): Promise<CasinoMyStats> {
  const pool = getPool();

  let wallets: string[];
  if (walletFilter) {
    const linked = await isWalletLinkedToUser(userId, walletFilter);
    wallets = linked ? [walletFilter] : [];
  } else {
    wallets = await listLinkedWalletAddresses(userId);
  }

  const { rows: userRows } = await pool.query<{
    discord_username: string | null;
    discord_image: string | null;
  }>(`SELECT discord_username, discord_image FROM users WHERE id = $1`, [userId]);
  const user = userRows[0];

  const empty: CasinoMyStats = {
    player: {
      discordUsername: user?.discord_username ?? null,
      discordImage: user?.discord_image ?? null,
      displayName: user?.discord_username ?? null,
      wallets: [],
    },
    overall: emptyGameStat(),
    games: {
      slots: emptyGameStat(),
      coinflip: emptyGameStat(),
      roulette: emptyGameStat(),
    },
  };

  if (wallets.length === 0) {
    return empty;
  }

  const [slotsRes, coinflipRes, rouletteRes] = await Promise.all([
    pool.query<StatRow>(
      `SELECT COALESCE(SUM(total_spins), 0)::int AS total_plays,
              COALESCE(SUM(total_wagered), 0) AS total_wagered,
              COALESCE(SUM(total_won), 0) AS total_won
       FROM slots_players
       WHERE token_used = 'bux' AND wallet_address = ANY($1::text[])`,
      [wallets],
    ),
    pool.query<StatRow>(
      `SELECT COALESCE(SUM(total_flips), 0)::int AS total_plays,
              COALESCE(SUM(total_wagered), 0) AS total_wagered,
              COALESCE(SUM(total_won), 0) AS total_won
       FROM coinflip_players
       WHERE token_used = 'bux' AND wallet_address = ANY($1::text[])`,
      [wallets],
    ),
    pool.query<StatRow>(
      `SELECT COALESCE(SUM(total_spins), 0)::int AS total_plays,
              COALESCE(SUM(total_wagered), 0) AS total_wagered,
              COALESCE(SUM(total_won), 0) AS total_won
       FROM roulette_players
       WHERE token_used = 'bux' AND wallet_address = ANY($1::text[])`,
      [wallets],
    ),
  ]);

  const games = {
    slots: aggregateRow(slotsRes.rows[0]),
    coinflip: aggregateRow(coinflipRes.rows[0]),
    roulette: aggregateRow(rouletteRes.rows[0]),
  };

  const overall = aggregateRow({
    total_plays: games.slots.totalPlays + games.coinflip.totalPlays + games.roulette.totalPlays,
    total_wagered: (
      BigInt(slotsRes.rows[0].total_wagered) +
      BigInt(coinflipRes.rows[0].total_wagered) +
      BigInt(rouletteRes.rows[0].total_wagered)
    ).toString(),
    total_won: (
      BigInt(slotsRes.rows[0].total_won) +
      BigInt(coinflipRes.rows[0].total_won) +
      BigInt(rouletteRes.rows[0].total_won)
    ).toString(),
  });

  return {
    player: {
      discordUsername: user?.discord_username ?? null,
      discordImage: user?.discord_image ?? null,
      displayName: user?.discord_username ?? null,
      wallets,
    },
    overall,
    games,
  };
}

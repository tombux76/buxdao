"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { BarChart3, Loader2, Trophy, X } from "lucide-react";
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton";
import type { CasinoMyStats, GameStat } from "@/lib/casino/stats";

type LeaderboardEntry = {
  rank: number;
  walletAddress: string;
  displayName: string;
  discordUsername: string | null;
  discordImage: string | null;
  totalPlays: number;
  totalWagered: number;
  totalWon: number;
  winRate: number;
};

type CasinoStatsModalProps = {
  onClose: () => void;
  walletAddress?: string | null;
};

type GameFilter = "all" | "slots" | "coinflip" | "roulette";
type SortBy = "winRate" | "wagered" | "won" | "plays";

const GAME_LABELS: Record<GameFilter, string> = {
  all: "All games",
  slots: "Slots",
  coinflip: "Coin Flip",
  roulette: "Roulette",
};

const SORT_LABELS: Record<SortBy, string> = {
  winRate: "Win %",
  wagered: "Wagered",
  won: "Won",
  plays: "Plays",
};

function formatBux(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function PlayerAvatar({ image, name }: { image?: string | null; name?: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className="h-8 w-8 shrink-0 rounded-full" />
    );
  }
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-cyan/15 text-xs font-semibold text-accent-cyan">
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

function StatGrid({ stats, playsLabel = "Plays" }: { stats: GameStat; playsLabel?: string }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border bg-bg-deep/40 px-3 py-2.5">
        <dt className="text-[10px] uppercase tracking-wide text-muted">Wagered</dt>
        <dd className="mt-1 text-sm font-semibold">{formatBux(stats.totalWagered)} BUX</dd>
      </div>
      <div className="rounded-xl border border-border bg-bg-deep/40 px-3 py-2.5">
        <dt className="text-[10px] uppercase tracking-wide text-muted">Won</dt>
        <dd className="mt-1 text-sm font-semibold">{formatBux(stats.totalWon)} BUX</dd>
      </div>
      <div className="rounded-xl border border-border bg-bg-deep/40 px-3 py-2.5">
        <dt className="text-[10px] uppercase tracking-wide text-muted">Win %</dt>
        <dd className="mt-1 text-sm font-semibold">{stats.winRate.toFixed(1)}%</dd>
      </div>
      <div className="rounded-xl border border-border bg-bg-deep/40 px-3 py-2.5">
        <dt className="text-[10px] uppercase tracking-wide text-muted">{playsLabel}</dt>
        <dd className="mt-1 text-sm font-semibold">{stats.totalPlays.toLocaleString()}</dd>
      </div>
    </dl>
  );
}

export function CasinoStatsModal({ onClose, walletAddress }: CasinoStatsModalProps) {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<"leaderboard" | "my-stats">("leaderboard");
  const [gameFilter, setGameFilter] = useState<GameFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("winRate");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [myStats, setMyStats] = useState<CasinoMyStats | null>(null);
  const [myStatsLoading, setMyStatsLoading] = useState(false);
  const [myStatsError, setMyStatsError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const loadLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const params = new URLSearchParams({
        gameType: gameFilter,
        sortBy,
        limit: "100",
      });
      const response = await fetch(`/api/leaderboard?${params}`);
      if (!response.ok) throw new Error("Failed to load leaderboard");
      const data = await response.json();
      setLeaderboard(data.leaderboard ?? []);
    } catch (error) {
      setLeaderboardError(error instanceof Error ? error.message : "Failed to load leaderboard");
      setLeaderboard([]);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [gameFilter, sortBy]);

  const loadMyStats = useCallback(async () => {
    if (!session?.user) return;
    setMyStatsLoading(true);
    setMyStatsError(null);
    try {
      const params = new URLSearchParams();
      if (walletAddress) params.set("wallet", walletAddress);
      const query = params.toString();
      const response = await fetch(`/api/casino/my-stats${query ? `?${query}` : ""}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load your stats");
      }
      setMyStats(await response.json());
    } catch (error) {
      setMyStatsError(error instanceof Error ? error.message : "Failed to load your stats");
      setMyStats(null);
    } finally {
      setMyStatsLoading(false);
    }
  }, [session?.user, walletAddress]);

  useEffect(() => {
    if (tab === "leaderboard") void loadLeaderboard();
  }, [tab, loadLeaderboard]);

  useEffect(() => {
    if (tab === "my-stats" && session?.user) void loadMyStats();
  }, [tab, session?.user, loadMyStats]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="glass-panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="casino-stats-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-accent-cyan">BUX Casino</p>
            <h2 id="casino-stats-title" className="mt-1 text-xl font-bold">
              Player stats
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted transition hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex gap-2 border-b border-border px-6 py-3">
          <button
            type="button"
            onClick={() => setTab("leaderboard")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === "leaderboard"
                ? "bg-accent-cyan/15 text-accent-cyan"
                : "text-muted hover:bg-bg-surface hover:text-foreground"
            }`}
          >
            <Trophy className="h-4 w-4" />
            Leaderboard
          </button>
          <button
            type="button"
            onClick={() => setTab("my-stats")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === "my-stats"
                ? "bg-accent-cyan/15 text-accent-cyan"
                : "text-muted hover:bg-bg-surface hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            My stats
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === "leaderboard" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Game
                  <select
                    value={gameFilter}
                    onChange={(event) => setGameFilter(event.target.value as GameFilter)}
                    className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    {(Object.keys(GAME_LABELS) as GameFilter[]).map((key) => (
                      <option key={key} value={key}>
                        {GAME_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  Sort by
                  <select
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value as SortBy)}
                    className="rounded-lg border border-border bg-bg-surface px-3 py-2 text-sm text-foreground"
                  >
                    {(Object.keys(SORT_LABELS) as SortBy[]).map((key) => (
                      <option key={key} value={key}>
                        {SORT_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {leaderboardLoading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-muted">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading leaderboard…
                </div>
              ) : leaderboardError ? (
                <p className="py-8 text-center text-sm text-red-400">{leaderboardError}</p>
              ) : leaderboard.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No players yet.</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry) => (
                    <div
                      key={entry.walletAddress}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-deep/30 px-4 py-3"
                    >
                      <span className="w-8 shrink-0 text-sm font-bold text-accent-cyan">
                        #{entry.rank}
                      </span>
                      <PlayerAvatar image={entry.discordImage} name={entry.displayName} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{entry.displayName}</p>
                        <p className="truncate font-mono text-[10px] text-muted">
                          {entry.walletAddress.slice(0, 4)}…{entry.walletAddress.slice(-4)}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-right text-xs sm:grid-cols-4">
                        <div>
                          <p className="text-muted">Win %</p>
                          <p className="font-semibold">{entry.winRate.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-muted">Wagered</p>
                          <p className="font-semibold">{formatBux(entry.totalWagered)}</p>
                        </div>
                        <div>
                          <p className="text-muted">Won</p>
                          <p className="font-semibold">{formatBux(entry.totalWon)}</p>
                        </div>
                        <div>
                          <p className="text-muted">Plays</p>
                          <p className="font-semibold">{entry.totalPlays.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : status === "loading" ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Checking session…
            </div>
          ) : !session?.user ? (
            <div className="space-y-4 py-6 text-center">
              <p className="text-sm text-muted">Sign in with Discord to view your casino stats.</p>
              <DiscordAuthButton callbackUrl="/games" />
            </div>
          ) : myStatsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading your stats…
            </div>
          ) : myStatsError ? (
            <p className="py-8 text-center text-sm text-red-400">{myStatsError}</p>
          ) : myStats ? (
            <div className="space-y-6">
              <div className="flex items-center gap-3 rounded-xl border border-border bg-bg-deep/30 px-4 py-3">
                <PlayerAvatar
                  image={myStats.player.discordImage}
                  name={myStats.player.displayName}
                />
                <div>
                  <p className="font-medium">{myStats.player.displayName ?? "Player"}</p>
                  {myStats.player.wallets.length > 0 ? (
                    <p className="text-xs text-muted">
                      {myStats.player.wallets.length} linked wallet
                      {myStats.player.wallets.length === 1 ? "" : "s"}
                    </p>
                  ) : (
                    <p className="text-xs text-muted">Link a wallet in Holder Hub to track stats</p>
                  )}
                </div>
              </div>

              <section className="space-y-2">
                <h3 className="text-sm font-semibold">Overall</h3>
                <StatGrid stats={myStats.overall} />
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-semibold">By game</h3>
                {(
                  [
                    ["slots", "Slots"],
                    ["coinflip", "Coin Flip"],
                    ["roulette", "Roulette"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-2">
                    <h4 className="text-xs font-medium uppercase tracking-wide text-muted">
                      {label}
                    </h4>
                    <StatGrid stats={myStats.games[key]} />
                  </div>
                ))}
              </section>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CasinoStatsButton({
  walletAddress,
  className = "inline-flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm transition hover:bg-bg-deep",
}: {
  walletAddress?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <BarChart3 className="h-4 w-4 text-accent-cyan" />
        Stats
      </button>
      {open ? (
        <CasinoStatsModal onClose={() => setOpen(false)} walletAddress={walletAddress} />
      ) : null}
    </>
  );
}

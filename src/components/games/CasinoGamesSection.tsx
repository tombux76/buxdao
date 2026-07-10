"use client";

import { GameCard } from "@/components/ui/GameCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CasinoStatsButton } from "@/components/games/CasinoStatsModal";
import type { Game } from "@/content/site";

type CasinoGamesSectionProps = {
  games: Game[];
};

export function CasinoGamesSection({ games }: CasinoGamesSectionProps) {
  return (
    <section>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <SectionHeader eyebrow="Casino" title="BUX Casino" description="Play with $BUX." />
        <CasinoStatsButton />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
        {games.map((game) => (
          <GameCard key={game.id} game={game} />
        ))}
      </div>
    </section>
  );
}

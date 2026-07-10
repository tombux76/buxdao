import type { Metadata } from "next";
import { GameCard } from "@/components/ui/GameCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { CasinoGamesSection } from "@/components/games/CasinoGamesSection";
import { games, pageMeta } from "@/content/site";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({ ...pageMeta.games, path: "/games" });

export default function GamesPage() {
  const casino = games.filter((g) => g.category === "casino");
  const cards = games.filter((g) => g.category === "cards");

  return (
    <div className="space-y-12">
      <SectionHeader
        eyebrow="Games"
        title="Play in the ecosystem"
        description="BUX Casino games run on-site with $BUX. Card games open on dedicated platforms."
      />

      <CasinoGamesSection games={casino} />

      <section>
        <SectionHeader eyebrow="Card games" title="External platforms" />
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>
    </div>
  );
}

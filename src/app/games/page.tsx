import { GameCard } from "@/components/ui/GameCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { games } from "@/content/site";

export default function GamesPage() {
  const casino = games.filter((g) => g.category === "casino");
  const cards = games.filter((g) => g.category === "cards");

  return (
    <div className="space-y-12">
      <SectionHeader
        eyebrow="Games"
        title="Play in the ecosystem"
        description="Casino games embedded on BUXDAO — card games on dedicated platforms."
      />
      <Card className="border-l-2 border-l-accent-cyan p-5">
        <p className="text-sm text-muted">
          Casino games will embed here via iframe. Gameplay and wallet integration coming in a
          later phase.
        </p>
      </Card>

      <section>
        <SectionHeader eyebrow="Casino" title="BUX Casino" description="Play with $BUX." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2">
          {casino.map((game) => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      </section>

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

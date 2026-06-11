import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import type { Game } from "@/content/site";

type GameCardProps = {
  game: Game;
};

export function GameCard({ game }: GameCardProps) {
  const inner = (
    <>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{game.name}</h3>
        <Badge variant={game.status === "live" ? "live" : "soon"}>{game.status}</Badge>
      </div>
      <p className="mb-4 text-sm text-muted">{game.description}</p>
      <div className="flex items-center justify-between">
        <div className="flex gap-1.5">
          {game.tokens.map((token) => (
            <span
              key={token}
              className="rounded-md border border-border bg-bg-deep/50 px-2 py-0.5 font-mono text-[11px] text-accent-gold"
            >
              {token}
            </span>
          ))}
        </div>
        {game.status === "live" && game.href !== "#" && (
          <span className="inline-flex items-center gap-1 text-sm text-accent-cyan">
            {game.external ? "Play" : "Preview"}
            <ArrowUpRight className="h-4 w-4" />
          </span>
        )}
      </div>
    </>
  );

  if (game.status === "soon" || game.href === "#") {
    return <Card className="p-5 opacity-75">{inner}</Card>;
  }

  if (game.external) {
    return (
      <a href={game.href} target="_blank" rel="noopener noreferrer" className="block">
        <Card glow="purple" className="p-5">{inner}</Card>
      </a>
    );
  }

  return (
    <Link href={game.href} className="block">
      <Card glow="cyan" className="p-5">{inner}</Card>
    </Link>
  );
}

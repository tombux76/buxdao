import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Gamepad2 } from "lucide-react";
import { Card } from "./Card";
import { Badge } from "./Badge";
import type { Game } from "@/content/site";

type GameCardProps = {
  game: Game;
};

export function GameCard({ game }: GameCardProps) {
  const inner = (
    <>
      <div className="relative mb-4 aspect-[16/10] overflow-hidden rounded-lg border border-border bg-bg-deep">
        {game.thumbnail ? (
          <Image
            src={game.thumbnail}
            alt=""
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, 50vw"
            className={
              game.category === "casino" ? "object-contain p-3" : "object-cover"
            }
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">
            <Gamepad2 className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-lg font-semibold">{game.name}</h3>
        <Badge variant={game.status === "live" ? "live" : "soon"}>{game.status}</Badge>
      </div>
      <p className="mb-4 whitespace-pre-line text-sm text-muted">{game.description}</p>
      <div className="flex items-center justify-between">
        {game.tokens.length > 0 ? (
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
        ) : (
          <span />
        )}
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
        <Card glow="purple" className="p-5">
          {inner}
        </Card>
      </a>
    );
  }

  return (
    <Link href={game.href} className="block">
      <Card glow="cyan" className="p-5">
        {inner}
      </Card>
    </Link>
  );
}

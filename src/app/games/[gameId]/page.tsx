import { GameEmbed, isValidGameId } from "@/components/games/GameEmbed";
import { notFound } from "next/navigation";

type GamePageProps = {
  params: Promise<{ gameId: string }>;
};

export default async function GamePage({ params }: GamePageProps) {
  const { gameId } = await params;
  if (!isValidGameId(gameId)) {
    notFound();
  }

  return <GameEmbed gameId={gameId} />;
}

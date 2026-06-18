import { NextRequest, NextResponse } from "next/server";
import { handleApplicationCommand } from "@/lib/discord/handlers";
import { sendFollowupMessage } from "@/lib/discord/followup";
import {
  InteractionType,
  type DiscordInteraction,
} from "@/lib/discord/interaction-types";
import { deferMessage, embedMessage } from "@/lib/discord/responses";
import { verifyDiscordSignature } from "@/lib/discord/verify";

const DEFERRED_COMMANDS = new Set([
  "nft",
  "rank",
  "collections",
  "profile",
  "mybux",
  "mynfts",
]);

export async function handleDiscordInteractionPost(request: NextRequest) {
  const publicKey = process.env.DISCORD_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return NextResponse.json({ error: "Discord interactions not configured" }, { status: 503 });
  }

  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  const body = await request.text();

  if (!verifyDiscordSignature({ body, signature, timestamp, publicKey })) {
    return new NextResponse("Invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body) as DiscordInteraction;

  if (interaction.type === InteractionType.PING) {
    return NextResponse.json({ type: 1 });
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return NextResponse.json({ type: 1 });
  }

  const command = interaction.data?.name ?? "";

  if (DEFERRED_COMMANDS.has(command)) {
    void runDeferred(interaction).catch((err) => {
      console.error("[discord] deferred handler failed:", err);
    });
    return NextResponse.json(deferMessage());
  }

  const result = await handleApplicationCommand(interaction);
  return NextResponse.json(embedMessage(result.embeds, result.ephemeral));
}

async function runDeferred(interaction: DiscordInteraction): Promise<void> {
  try {
    const result = await handleApplicationCommand(interaction);
    await sendFollowupMessage({
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      embeds: result.embeds,
    });
  } catch (error) {
    console.error("[discord] command error:", error);
    await sendFollowupMessage({
      applicationId: interaction.application_id,
      interactionToken: interaction.token,
      content: "Something went wrong fetching on-chain data. Please try again.",
    });
  }
}

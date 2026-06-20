import type { APIEmbed } from "@/lib/discord/embed-types";
import { getActivityChannelId, getDiscordBotToken } from "@/lib/nft-activity/config";

export async function postActivityEmbed(embed: APIEmbed): Promise<void> {
  const token = getDiscordBotToken();
  const channelId = getActivityChannelId();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }
  if (!channelId) {
    throw new Error("DISCORD_ACTIVITY_CHANNEL_ID is not configured");
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ embeds: [embed] }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord post failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

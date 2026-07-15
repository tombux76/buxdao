import type { APIEmbed } from "@/lib/discord/embed-types";
import {
  absoluteSiteUrl,
  formatBux,
  shortWallet,
  solscanTxUrl,
  solscanWalletUrl,
} from "@/lib/discord/embed-types";
import { getDiscordBotToken } from "@/lib/nft-activity/config";
import { getAnnouncementsChannelId } from "@/lib/prize-draw/config";

export async function postPrizeDrawAnnouncement(params: {
  winnerDiscordUsername: string;
  payoutWallet: string;
  prizeAmount: number;
  prizeUsdValue: number | null;
  txSignature: string;
  eligiblePoolSize: number;
  tokenImageUrl?: string | null;
}): Promise<void> {
  const token = getDiscordBotToken();
  const channelId = getAnnouncementsChannelId();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }
  if (!channelId) {
    throw new Error("Discord announcements channel is not configured");
  }

  const usdLine =
    params.prizeUsdValue != null
      ? ` (~$${formatBux(params.prizeUsdValue)} USD)`
      : "";

  const embed: APIEmbed = {
    title: "EMPIRE weekly prize draw — winner",
    description: `**${params.winnerDiscordUsername}** won **${formatBux(params.prizeAmount)} EMPIRE**${usdLine}.`,
    color: 0xf5c542,
    fields: [
      {
        name: "Payout wallet",
        value: `[${shortWallet(params.payoutWallet)}](${solscanWalletUrl(params.payoutWallet)})`,
        inline: true,
      },
      {
        name: "Eligible pool",
        value: `${params.eligiblePoolSize.toLocaleString()} verified holders`,
        inline: true,
      },
      {
        name: "Transaction",
        value: `[View on Solscan](${solscanTxUrl(params.txSignature)})`,
        inline: false,
      },
    ],
    footer: { text: "BUXDAO · Omerta Empire City founders bond yield" },
    url: absoluteSiteUrl("/empire-draw"),
  };

  if (params.tokenImageUrl) {
    embed.thumbnail = { url: params.tokenImageUrl };
  }

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: "@everyone",
      embeds: [embed],
      allowed_mentions: { parse: ["everyone"] },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord prize announcement failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

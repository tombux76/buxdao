import type { APIEmbed } from "@/lib/discord/embed-types";
import {
  formatBux,
  formatSol,
  hubLink,
  shortWallet,
  solscanTxUrl,
} from "@/lib/discord/embed-types";
import { CASHOUT_ANNOUNCEMENTS_CHANNEL_ID } from "@/lib/cashout/config";
import { getDiscordBotToken } from "@/lib/nft-activity/config";

export async function postCashoutAnnouncement(params: {
  discordUsername: string;
  discordImage: string | null;
  amountBux: number;
  solNet: number;
  buxTxSignature: string;
  solTxSignature: string;
}): Promise<void> {
  const token = getDiscordBotToken();
  if (!token) {
    throw new Error("DISCORD_BOT_TOKEN is not configured");
  }

  const embed: APIEmbed = {
    title: "$BUX cashout",
    description: `**${params.discordUsername}** cashed out **${formatBux(params.amountBux)} $BUX** for **${formatSol(params.solNet)} SOL**.`,
    color: 0xf5c542,
    fields: [
      {
        name: "$BUX cashed out",
        value: formatBux(params.amountBux),
        inline: true,
      },
      {
        name: "SOL received",
        value: `${formatSol(params.solNet)} SOL`,
        inline: true,
      },
      {
        name: "Transactions",
        value: `[$BUX transfer](${solscanTxUrl(params.buxTxSignature)}) · [SOL payout](${solscanTxUrl(params.solTxSignature)})`,
        inline: false,
      },
    ],
    footer: { text: "BUXDAO · Holder Hub" },
    url: hubLink(),
  };

  if (params.discordImage) {
    embed.thumbnail = { url: params.discordImage };
  }

  const response = await fetch(
    `https://discord.com/api/v10/channels/${CASHOUT_ANNOUNCEMENTS_CHANNEL_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bot ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ embeds: [embed] }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Discord cashout announcement failed (${response.status}): ${body.slice(0, 300)}`);
  }
}

export function cashoutDisplayName(
  discordUsername: string | null | undefined,
  payoutWallet: string,
): string {
  return discordUsername?.trim() || shortWallet(payoutWallet);
}

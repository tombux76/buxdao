import type { APIEmbed } from "@/lib/discord/embed-types";

export async function sendFollowupMessage(params: {
  applicationId: string;
  interactionToken: string;
  embeds?: APIEmbed[];
  content?: string;
}): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${params.applicationId}/${params.interactionToken}/messages/@original`;
  const body: { embeds?: APIEmbed[]; content?: string } = {};
  if (params.embeds?.length) {
    body.embeds = params.embeds;
  }
  if (params.content) {
    body.content = params.content;
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Discord followup failed (${res.status}): ${detail.slice(0, 200)}`);
  }
}

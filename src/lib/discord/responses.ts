import type { APIEmbed } from "@/lib/discord/embed-types";

export function embedMessage(embeds: APIEmbed[], ephemeral = false) {
  return {
    type: 4,
    data: {
      embeds,
      flags: ephemeral ? 64 : 0,
    },
  };
}

export function textMessage(content: string, ephemeral = false) {
  return {
    type: 4,
    data: {
      content,
      flags: ephemeral ? 64 : 0,
    },
  };
}

export function deferMessage(ephemeral = false) {
  return {
    type: 5,
    data: ephemeral ? { flags: 64 } : undefined,
  };
}

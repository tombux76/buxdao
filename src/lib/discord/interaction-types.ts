export type InteractionOption = {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: InteractionOption[];
};

export type DiscordInteraction = {
  id: string;
  type: number;
  token: string;
  application_id: string;
  guild_id?: string;
  member?: {
    roles?: string[];
    user?: { id: string; username?: string };
  };
  user?: { id: string; username?: string };
  data?: {
    name: string;
    options?: InteractionOption[];
  };
};

export const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
} as const;

export const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE: 4,
  DEFERRED_CHANNEL_MESSAGE: 5,
} as const;

export const OptionType = {
  SUB_COMMAND: 1,
  STRING: 3,
  INTEGER: 4,
  USER: 6,
} as const;

export function getInvokerId(interaction: DiscordInteraction): string | null {
  return interaction.member?.user?.id ?? interaction.user?.id ?? null;
}

export function getSubcommand(interaction: DiscordInteraction): {
  name: string;
  options: InteractionOption[];
} | null {
  const top = interaction.data?.options?.[0];
  if (!top || top.type !== OptionType.SUB_COMMAND) {
    return null;
  }
  return { name: top.name, options: top.options ?? [] };
}

export function getOptionInt(options: InteractionOption[], name: string): number | null {
  const opt = options.find((o) => o.name === name);
  if (!opt || typeof opt.value !== "number") {
    return null;
  }
  return opt.value;
}

export function getOptionString(options: InteractionOption[], name: string): string | null {
  const opt = options.find((o) => o.name === name);
  if (!opt || typeof opt.value !== "string") {
    return null;
  }
  return opt.value;
}

export function getOptionUserId(options: InteractionOption[], name: string): string | null {
  const opt = options.find((o) => o.name === name);
  if (!opt || typeof opt.value !== "string") {
    return null;
  }
  return opt.value;
}

export function getTopLevelString(interaction: DiscordInteraction, name: string): string | null {
  return getOptionString(interaction.data?.options ?? [], name);
}

export function getTopLevelUserId(interaction: DiscordInteraction, name: string): string | null {
  return getOptionUserId(interaction.data?.options ?? [], name);
}

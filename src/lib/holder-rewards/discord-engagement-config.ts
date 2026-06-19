export const DISCORD_MESSAGE_BUX = 1;
export const DISCORD_REACTION_BUX = 5;
export const DISCORD_MIN_MESSAGE_LENGTH = 10;
export const DISCORD_MESSAGE_COOLDOWN_MS = 5 * 60 * 1000;
export const DISCORD_MAX_MESSAGES_PER_DAY = 50;

export const DISCORD_ANNOUNCEMENTS_CHANNEL_ID =
  process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID?.trim() || "948254981327290408";

export function getDiscordGuildId(): string {
  return process.env.DISCORD_GUILD_ID?.trim() || "";
}

export function getDiscordBotToken(): string {
  return process.env.DISCORD_BOT_TOKEN?.trim() || "";
}

/** Omerta — Empire City founders bond weekly holder prize draw. */
export const EMPIRE_TOKEN_MINT = "EmpirdtfUMfBQXEjnNmTngeimjfizfuSBD3TN9zqzydj";

export const PRIZE_WALLET = "AAjb7cAT7C7BRU7ULmXcQRLhTAVxky6m4D8aNC7VJLVk";

export const PRIZE_EMPIRE_AMOUNT = 50_000;

export const POOL_CACHE_TTL_MS = 10 * 60 * 1000;

/** BUXDAO main announcements channel — EMPIRE draw winner posts go here. */
export const PRIZE_DRAW_ANNOUNCEMENTS_CHANNEL_ID = "948254981327290408";

export function getAnnouncementsChannelId(): string {
  return PRIZE_DRAW_ANNOUNCEMENTS_CHANNEL_ID;
}

import { syncDiscordProfile } from "@/lib/hub/discord-profile";
import { syncTwitterProfile } from "@/lib/hub/linked-social";

/** Refresh Discord and X profile fields from provider APIs. */
export async function syncUserSocialProfiles(userId: string): Promise<void> {
  await Promise.all([syncDiscordProfile(userId, true), syncTwitterProfile(userId, true)]);
}

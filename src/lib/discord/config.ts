import { collectionConfigs } from "@/content/site";

/** Subcommand name → collection id (`/nft`) */
export const NFT_SUBCOMMAND_COLLECTION: Record<string, string> = {
  cat: "fcked-catz",
  celeb: "celebrity-catz",
  mm: "money-monsters",
  mm3d: "money-monsters-3d",
  bot: "ai-bitbots",
};

/** Subcommand name → collection id (`/rank`) */
export const RANK_SUBCOMMAND_COLLECTION: Record<string, string> = {
  cat: "fcked-catz",
  mm: "money-monsters",
  mm3d: "money-monsters-3d",
};

/** `/collections` choice value → collection id (active collections only) */
export const COLLECTION_CHOICE_MAP: Record<string, string> = {
  FCKEDCATZ: "fcked-catz",
  MM: "money-monsters",
  AIBB: "ai-bitbots",
  MM3D: "money-monsters-3d",
  CelebCatz: "celebrity-catz",
};

export const LEGACY_COLLECTION_CHOICES = new Set([
  "AELxAIBB",
  "AIRB",
  "AUSQRL",
  "DDBOT",
  "CLB",
]);

export function getCollectionConfig(collectionId: string) {
  return collectionConfigs.find((c) => c.id === collectionId);
}

export function getAdminRoleIds(): string[] {
  return (process.env.DISCORD_ADMIN_ROLE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function getDiscordApplicationId(): string {
  return process.env.AUTH_DISCORD_ID?.trim() ?? "";
}

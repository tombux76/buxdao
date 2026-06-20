import { collectionConfigs, tokenConfig } from "@/content/site";
import { getCollectionConfig } from "@/lib/discord/config";

export const NFT_ACTIVITY_EVENT_TYPES = [
  "NFT_SALE",
  "NFT_LISTING",
  "NFT_CANCEL_LISTING",
  "TRANSFER",
  "BURN_NFT",
] as const;

export function getActivityChannelId(): string {
  return process.env.DISCORD_ACTIVITY_CHANNEL_ID?.trim() ?? "1097864119849320469";
}

export function getHeliusWebhookSecret(): string {
  return process.env.HELIUS_WEBHOOK_SECRET?.trim() ?? "";
}

export function getDiscordBotToken(): string {
  return process.env.DISCORD_BOT_TOKEN?.trim() ?? "";
}

export function getCollectionMintAddresses(): string[] {
  return collectionConfigs.map((c) => c.collectionMint);
}

/** Helius fires when a monitored address appears in the tx — listings/sales use marketplace programs, not collection mints. */
export const MARKETPLACE_MONITOR_ADDRESSES = [
  /** Magic Eden v2 marketplace program */
  "M2mx93ekt1fmXSVkTrUL9xVFHkmME8HTUi5Cyc5aF7K",
  /** Magic Eden escrow / listed NFT token owner */
  "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix",
  /** Tensor swap + marketplace */
  "TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hYbdXZp9R8",
  "TCMPaqyCSx2KABk68Shruf4rp7CxcNi8hYbdXZp9R8",
  /** GraveMarket (Solana Deads) */
  "GRAVENNCLF1daKeBAHCvbD2Pw12xLMY6GGM2e4LChwcd",
] as const;

export function getWebhookMonitorAddresses(): string[] {
  return [...MARKETPLACE_MONITOR_ADDRESSES];
}

const COLLECTION_BY_MINT = new Map(collectionConfigs.map((c) => [c.collectionMint, c]));

export function getCollectionByMint(collectionMint: string) {
  return COLLECTION_BY_MINT.get(collectionMint) ?? getCollectionConfig(collectionMint);
}

/** Marketplaces and program accounts — not wallet-to-wallet transfers. */
const MARKETPLACE_SOURCES = new Set([
  "MAGIC_EDEN",
  "TENSOR",
  "TENSOR_SWAP",
  "SOLANART",
  "HYPERSPACE",
  "EXCHANGE_ART",
  "SOLSEA",
  "YAWWW",
  "FORM_FUNCTION",
  "METAPLEX",
  "FOXY_AUCTION",
  "ENGLISH_AUCTION",
  "DIGITAL_EYES",
  "GRAVE_MARKET",
]);

export function isMarketplaceSource(source: string | null | undefined): boolean {
  if (!source?.trim()) {
    return false;
  }
  return MARKETPLACE_SOURCES.has(source.trim().toUpperCase());
}

export function getNonWalletAddresses(): Set<string> {
  const addresses = new Set<string>([
    ...tokenConfig.exemptWallets,
    tokenConfig.communityWallet,
    /** Magic Eden V2 authority / escrow */
    "1BWutmTvYPwDtmw9abTkS4Ssr8no61spGAvW1X6NDix",
    /** Tensor escrow */
    "TSWAPaqyCSx2KABk68Shruf4rp7CxcNi8hYbdXZp9R8",
    /** Metaplex auction house / common program ids */
    "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
  ]);

  for (const config of collectionConfigs) {
    if (config.stakingWallet) {
      addresses.add(config.stakingWallet);
    }
  }

  return addresses;
}

export function isWalletToWalletTransfer(from: string | null | undefined, to: string | null | undefined): boolean {
  if (!from?.trim() || !to?.trim() || from === to) {
    return false;
  }

  const blocked = getNonWalletAddresses();
  if (blocked.has(from) || blocked.has(to)) {
    return false;
  }

  return true;
}

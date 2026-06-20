import { lookupHowRareNftByMint, collectionHasHowRareRanks, type HowRareNft } from "@/lib/discord/howrare";
import type { APIEmbed } from "@/lib/discord/embed-types";
import {
  collectionLogoUrl,
  formatSol,
  graveMarketNftUrl,
  hexColorToEmbed,
  shortWallet,
  solscanTxUrl,
  solscanWalletUrl,
} from "@/lib/discord/embed-types";
import { lookupDiscordUsernameByWallet } from "@/lib/discord/user-data";
import type { CollectionConfig } from "@/content/site";

export type NftActivityEventType =
  | "sale"
  | "list"
  | "delist"
  | "transfer"
  | "burn"
  | "stake"
  | "unstake";

const EVENT_LABELS: Record<NftActivityEventType, string> = {
  sale: "Sale",
  list: "Listed",
  delist: "Delisted",
  transfer: "Transfer",
  burn: "Burned",
  stake: "Staked",
  unstake: "Unstaked",
};

export async function formatWalletField(wallet: string): Promise<string> {
  const discordUsername = await lookupDiscordUsernameByWallet(wallet);
  if (discordUsername) {
    return `@${discordUsername.replace(/^@/, "")}`;
  }
  const label = shortWallet(wallet);
  return `[${label}](${solscanWalletUrl(wallet)})`;
}

async function resolveHowRareEntry(
  collectionId: string,
  mint: string,
  known?: HowRareNft | null,
): Promise<HowRareNft | null> {
  if (!collectionHasHowRareRanks(collectionId)) {
    return null;
  }
  if (known) {
    return known;
  }
  try {
    return await lookupHowRareNftByMint(collectionId, mint);
  } catch {
    return null;
  }
}

export async function buildNftEmbed(
  config: CollectionConfig,
  params: {
    mint: string;
    name: string;
    owner: string | null;
    image: string | null;
    howRare?: HowRareNft | null;
    footerSuffix?: string;
  },
): Promise<APIEmbed> {
  const howRare = await resolveHowRareEntry(config.id, params.mint, params.howRare);
  const fields = [
    { name: "Mint", value: `\`${params.mint}\``, inline: false },
    ...(params.owner ? [{ name: "Owner", value: await formatWalletField(params.owner), inline: true }] : []),
    ...(howRare ? [{ name: "Rank", value: `#${howRare.rank}`, inline: true }] : []),
  ];

  const footerText = params.footerSuffix ? `BUXDAO · ${params.footerSuffix}` : "BUXDAO · GraveMarket";

  return {
    title: params.name,
    url: graveMarketNftUrl(params.mint),
    color: hexColorToEmbed(config.accent),
    thumbnail: { url: collectionLogoUrl(config.logo) },
    fields,
    ...(params.image ? { image: { url: params.image } } : {}),
    footer: { text: footerText },
  };
}

export function formatMarketplaceLabel(source: string | null | undefined): string | null {
  if (!source?.trim()) {
    return null;
  }
  const normalized = source.trim().toUpperCase();
  const labels: Record<string, string> = {
    MAGIC_EDEN: "Magic Eden",
    TENSOR: "Tensor",
    TENSOR_SWAP: "Tensor",
    SOLANART: "Solanart",
    HYPERSPACE: "Hyperspace",
    EXCHANGE_ART: "Exchange Art",
    SOLSEA: "Solsea",
    YAWWW: "Yawww",
    FORM_FUNCTION: "Formfunction",
    METAPLEX: "Metaplex",
    GRAVE_MARKET: "GraveMarket",
    PHANTOM: "Phantom",
    SYSTEM_PROGRAM: "Wallet",
  };
  return labels[normalized] ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function buildActivityEmbed(
  config: CollectionConfig,
  params: {
    mint: string;
    name: string;
    image: string | null;
    owner: string | null;
    howRare?: HowRareNft | null;
    eventType: NftActivityEventType;
    priceLamports?: number | null;
    seller?: string | null;
    buyer?: string | null;
    staker?: string | null;
    from?: string | null;
    to?: string | null;
    marketplace?: string | null;
    platform?: string | null;
    signature: string;
  },
): Promise<APIEmbed> {
  const howRare = await resolveHowRareEntry(config.id, params.mint, params.howRare);
  const eventLabel = EVENT_LABELS[params.eventType];
  const marketplaceLabel = formatMarketplaceLabel(params.marketplace);
  const platformLabel = params.platform ?? marketplaceLabel;

  const fields: APIEmbed["fields"] = [
    { name: "Event", value: eventLabel, inline: true },
    ...(marketplaceLabel ? [{ name: "Marketplace", value: marketplaceLabel, inline: true }] : []),
    ...(platformLabel && !marketplaceLabel
      ? [{ name: "Platform", value: platformLabel, inline: true }]
      : []),
    ...(params.priceLamports != null && params.priceLamports > 0
      ? [{ name: "Price", value: `${formatSol(params.priceLamports / 1e9)} SOL`, inline: true }]
      : []),
    { name: "Mint", value: `\`${params.mint}\``, inline: false },
  ];

  if (params.seller) {
    fields.push({ name: "Seller", value: await formatWalletField(params.seller), inline: true });
  }
  if (params.buyer) {
    fields.push({ name: "Buyer", value: await formatWalletField(params.buyer), inline: true });
  }
  if (params.from) {
    fields.push({ name: "From", value: await formatWalletField(params.from), inline: true });
  }
  if (params.to) {
    fields.push({ name: "To", value: await formatWalletField(params.to), inline: true });
  }
  if (params.owner && params.eventType === "burn") {
    fields.push({ name: "Burned by", value: await formatWalletField(params.owner), inline: true });
  }
  if (params.staker) {
    fields.push({ name: "Staker", value: await formatWalletField(params.staker), inline: true });
  }
  if (howRare) {
    fields.push({ name: "Rank", value: `#${howRare.rank}`, inline: true });
  }

  fields.push({
    name: "Transaction",
    value: `[View on Solscan](${solscanTxUrl(params.signature)})`,
    inline: false,
  });

  const footerParts = ["BUXDAO", platformLabel ?? eventLabel].filter(Boolean);

  return {
    title: `${eventLabel} · ${params.name}`,
    url: graveMarketNftUrl(params.mint),
    color: hexColorToEmbed(config.accent),
    thumbnail: { url: collectionLogoUrl(config.logo) },
    fields,
    ...(params.image ? { image: { url: params.image } } : {}),
    footer: { text: footerParts.join(" · ") },
  };
}

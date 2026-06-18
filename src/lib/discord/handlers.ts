import { fetchGraveMarketCollectionStats } from "@/lib/gravemarket";
import {
  COLLECTION_CHOICE_MAP,
  getAdminRoleIds,
  getCollectionConfig,
  NFT_SUBCOMMAND_COLLECTION,
  RANK_SUBCOMMAND_COLLECTION,
} from "@/lib/discord/config";
import { lookupNftByNumber, lookupNftByRank } from "@/lib/discord/collection-index";
import type { APIEmbed } from "@/lib/discord/embed-types";
import {
  collectionGifUrl,
  collectionLogoUrl,
  formatBux,
  formatSol,
  hexColorToEmbed,
  hubLink,
  shortWallet,
  solscanNftUrl,
  solscanWalletUrl,
} from "@/lib/discord/embed-types";
import { fetchAsset } from "@/lib/discord/helius";
import {
  getInvokerId,
  getOptionInt,
  getSubcommand,
  getTopLevelString,
  getTopLevelUserId,
  type DiscordInteraction,
} from "@/lib/discord/interaction-types";
import { countNftsByCollection, getDiscordUserProfile } from "@/lib/discord/user-data";
import { getRankMultiplier } from "@/lib/holder-rewards/multipliers";

function isAdmin(interaction: DiscordInteraction): boolean {
  const adminRoles = getAdminRoleIds();
  if (adminRoles.length === 0) {
    return false;
  }
  const memberRoles = interaction.member?.roles ?? [];
  return memberRoles.some((r) => adminRoles.includes(r));
}

function notLinkedEmbed(): APIEmbed {
  return {
    title: "Wallet not linked",
    description: `Link a wallet on the [Holder Hub](${hubLink()}) to use this command.`,
    color: 0xff4d4d,
  };
}

function collectionEmbedImage(config: { gif: string; accent: string }): Pick<APIEmbed, "image" | "color"> {
  return {
    color: hexColorToEmbed(config.accent),
    image: { url: collectionGifUrl(config.gif) },
  };
}

function buildNftEmbed(params: {
  collectionName: string;
  mint: string;
  name: string;
  number: number | null;
  rank: number | null;
  owner: string | null;
  image: string | null;
  collectionId: string;
  collectionGif: string;
  collectionAccent: string;
}): APIEmbed {
  const bonusMult = getRankMultiplier(params.mint, params.collectionId);
  const fields = [
    { name: "Collection", value: params.collectionName, inline: true },
    ...(params.number != null ? [{ name: "Token #", value: String(params.number), inline: true }] : []),
    ...(params.rank != null ? [{ name: "Rarity rank", value: String(params.rank), inline: true }] : []),
    { name: "Mint", value: `\`${params.mint}\``, inline: false },
    ...(params.owner
      ? [{ name: "Owner", value: `[${shortWallet(params.owner)}](${solscanWalletUrl(params.owner)})`, inline: true }]
      : []),
    ...(bonusMult > 1
      ? [{ name: "Holder bonus", value: `${bonusMult}× daily rewards multiplier`, inline: true }]
      : []),
  ];

  return {
    title: params.name,
    url: solscanNftUrl(params.mint),
    color: hexColorToEmbed(params.collectionAccent),
    fields,
    ...(params.image
      ? { image: { url: params.image }, thumbnail: { url: collectionGifUrl(params.collectionGif) } }
      : { image: { url: collectionGifUrl(params.collectionGif) } }),
    footer: { text: "BUXDAO · on-chain via Helius" },
  };
}

async function handleNft(subcommand: string, tokenId: number): Promise<APIEmbed> {
  const collectionId = NFT_SUBCOMMAND_COLLECTION[subcommand];
  const config = collectionId ? getCollectionConfig(collectionId) : undefined;
  if (!config) {
    return { title: "Unknown collection", description: "That subcommand is not supported.", color: 0xff4d4d };
  }

  const indexed = await lookupNftByNumber(collectionId, tokenId);
  if (!indexed) {
    return {
      title: `${config.name} #${tokenId}`,
      description: "NFT not found in this collection (on-chain index).",
      ...collectionEmbedImage(config),
    };
  }

  const live = await fetchAsset(indexed.mint);
  const owner = live?.ownership?.owner ?? indexed.owner;

  return buildNftEmbed({
    collectionName: config.name,
    collectionId,
    collectionGif: config.gif,
    collectionAccent: config.accent,
    mint: indexed.mint,
    name: indexed.name,
    number: indexed.number,
    rank: indexed.rank,
    owner,
    image: indexed.image,
  });
}

async function handleRank(subcommand: string, rank: number): Promise<APIEmbed> {
  const collectionId = RANK_SUBCOMMAND_COLLECTION[subcommand];
  const config = collectionId ? getCollectionConfig(collectionId) : undefined;
  if (!config) {
    return { title: "Unknown collection", description: "That subcommand is not supported.", color: 0xff4d4d };
  }

  const indexed = await lookupNftByRank(collectionId, rank);
  if (!indexed) {
    return {
      title: `${config.name} rank #${rank}`,
      description:
        "No NFT with this rarity rank in the on-chain index. Rank metadata may be missing for some tokens.",
      ...collectionEmbedImage(config),
    };
  }

  return buildNftEmbed({
    collectionName: config.name,
    collectionId,
    collectionGif: config.gif,
    collectionAccent: config.accent,
    mint: indexed.mint,
    name: indexed.name,
    number: indexed.number,
    rank: indexed.rank ?? rank,
    owner: indexed.owner,
    image: indexed.image,
  });
}

async function handleCollections(choice: string): Promise<APIEmbed> {
  const collectionId = COLLECTION_CHOICE_MAP[choice];
  if (!collectionId) {
    return {
      title: "Unknown collection",
      description: `Unrecognized collection choice \`${choice}\`.`,
      color: 0xff4d4d,
    };
  }

  const config = getCollectionConfig(collectionId);
  if (!config) {
    return { title: "Collection not found", color: 0xff4d4d };
  }

  const stats = await fetchGraveMarketCollectionStats(config.id);

  const marketFields = stats
    ? [
        { name: "Floor", value: stats.floor, inline: true },
        { name: "24h volume", value: stats.volume24h, inline: true },
        { name: "Total volume", value: stats.totalVolume, inline: true },
        { name: "Supply", value: stats.supply, inline: true },
        { name: "Listed", value: stats.listed, inline: true },
        { name: "% listed", value: stats.percentListed, inline: true },
      ]
    : [{ name: "Market data", value: "GraveMarket stats unavailable right now.", inline: false }];

  return {
    title: config.name,
    description: `Daily staking yield: **${config.dailyBuxYield} $BUX** / NFT / day on [GraveStake](${config.graveStakeUrl})`,
    ...collectionEmbedImage(config),
    thumbnail: { url: collectionLogoUrl(config.logo) },
    fields: marketFields,
    footer: { text: "Market data · GraveMarket" },
  };
}

async function resolveTargetDiscordId(
  interaction: DiscordInteraction,
  userOptionName: string,
): Promise<{ discordId: string; error?: APIEmbed }> {
  const invokerId = getInvokerId(interaction);
  if (!invokerId) {
    return { discordId: "", error: { title: "Error", description: "Could not identify user.", color: 0xff4d4d } };
  }

  const targetId = getTopLevelUserId(interaction, userOptionName) ?? invokerId;
  if (targetId !== invokerId && !isAdmin(interaction)) {
    return {
      discordId: "",
      error: {
        title: "Admin only",
        description: "Only admins can view other users.",
        color: 0xff4d4d,
      },
    };
  }

  return { discordId: targetId };
}

async function handleProfile(interaction: DiscordInteraction): Promise<APIEmbed> {
  const { discordId, error } = await resolveTargetDiscordId(interaction, "user");
  if (error) {
    return error;
  }

  const profile = await getDiscordUserProfile(discordId);
  if (!profile) {
    return notLinkedEmbed();
  }

  const counts = countNftsByCollection(profile.holdings).filter((c) => c.count > 0);
  const nftSummary =
    counts.length > 0
      ? counts.map((c) => `**${c.name}:** ${c.count}`).join("\n")
      : "No BUXDAO NFTs in linked wallets";

  return {
    title: profile.discordUsername ? `@${profile.discordUsername}` : "BUXDAO profile",
    description: nftSummary,
    color: 0x5865f2,
    fields: [
      {
        name: "Linked wallets",
        value: profile.linkedWallets.map((w) => `[${shortWallet(w)}](${solscanWalletUrl(w)})`).join("\n"),
      },
      { name: "$BUX balance", value: `${formatBux(profile.holdings.buxBalance)} $BUX`, inline: true },
      {
        name: "Cashout value",
        value: `${formatSol(profile.cashoutSol)} SOL`,
        inline: true,
      },
    ],
    footer: { text: "Wallet-held NFTs · Hub-linked wallets only" },
  };
}

async function handleMyBux(interaction: DiscordInteraction): Promise<APIEmbed> {
  const { discordId, error } = await resolveTargetDiscordId(interaction, "user");
  if (error) {
    return error;
  }

  const profile = await getDiscordUserProfile(discordId);
  if (!profile) {
    return notLinkedEmbed();
  }

  return {
    title: "$BUX balance",
    description: `**${formatBux(profile.holdings.buxBalance)}** $BUX`,
    color: 0xfff44d,
    fields: [
      { name: "Cashout pool value", value: `${formatSol(profile.cashoutSol)} SOL`, inline: true },
      { name: "USD estimate", value: `$${profile.cashoutUsd.toFixed(2)}`, inline: true },
    ],
    footer: { text: "On-chain balance across linked wallets" },
  };
}

async function handleMyNfts(interaction: DiscordInteraction): Promise<APIEmbed> {
  const { discordId, error } = await resolveTargetDiscordId(interaction, "user");
  if (error) {
    return error;
  }

  const profile = await getDiscordUserProfile(discordId);
  if (!profile) {
    return notLinkedEmbed();
  }

  const counts = countNftsByCollection(profile.holdings);
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const lines = counts.map((c) => `**${c.name}:** ${c.count}`);

  return {
    title: "NFT holdings",
    description: lines.join("\n") || "No NFTs found",
    color: 0x4dff4d,
    fields: [{ name: "Total", value: String(total), inline: true }],
    footer: { text: "Wallet-held + GraveStake staked (attributed to your wallet)" },
  };
}

function handleHelp(): APIEmbed {
  return {
    title: "BUXDAO bot commands",
    description: "On-chain data via Helius · profiles require a Hub-linked wallet",
    color: 0x5865f2,
    thumbnail: { url: collectionLogoUrl("/brand/bux-logo.png") },
    fields: [
      { name: "/nft", value: "`cat` `celeb` `mm` `mm3d` `bot` + token **#id** — NFT lookup", inline: false },
      { name: "/rank", value: "`cat` `mm` `mm3d` + **rank** — NFT by rarity rank", inline: false },
      { name: "/collections", value: "Floor, volume, supply for a collection", inline: false },
      { name: "/profile", value: "Your Hub profile, wallets, $BUX, NFT counts", inline: false },
      { name: "/mybux", value: "$BUX balance and cashout value", inline: false },
      { name: "/mynfts", value: "NFT counts per collection", inline: false },
      { name: "/addclaim", value: "Disabled — use GraveStake staking + Holder Hub", inline: false },
      { name: "Holder Hub", value: hubLink(), inline: false },
    ],
  };
}

function handleAddClaim(): APIEmbed {
  return {
    title: "Command disabled",
    description:
      "Manual BUX claims are no longer used. Earn $BUX via [GraveStake](https://gravestake.io) staking. Link wallets on the Holder Hub for profile commands.",
    color: 0x888888,
  };
}

export type CommandResult = {
  embeds: APIEmbed[];
  ephemeral?: boolean;
};

export async function handleApplicationCommand(interaction: DiscordInteraction): Promise<CommandResult> {
  const command = interaction.data?.name;
  if (!command) {
    return { embeds: [{ title: "Error", description: "Unknown command.", color: 0xff4d4d }] };
  }

  switch (command) {
    case "nft": {
      const sub = getSubcommand(interaction);
      const tokenId = sub ? getOptionInt(sub.options, "id") : null;
      if (!sub || tokenId == null) {
        return { embeds: [{ title: "Usage", description: "/nft <collection> id:<number>", color: 0xff4d4d }] };
      }
      return { embeds: [await handleNft(sub.name, tokenId)] };
    }
    case "rank": {
      const sub = getSubcommand(interaction);
      const rank = sub ? getOptionInt(sub.options, "rank") : null;
      if (!sub || rank == null) {
        return { embeds: [{ title: "Usage", description: "/rank <collection> rank:<number>", color: 0xff4d4d }] };
      }
      return { embeds: [await handleRank(sub.name, rank)] };
    }
    case "collections": {
      const choice = getTopLevelString(interaction, "collection");
      if (!choice) {
        return { embeds: [{ title: "Usage", description: "/collections collection:<name>", color: 0xff4d4d }] };
      }
      return { embeds: [await handleCollections(choice)] };
    }
    case "profile":
      return { embeds: [await handleProfile(interaction)] };
    case "mybux":
      return { embeds: [await handleMyBux(interaction)] };
    case "mynfts":
      return { embeds: [await handleMyNfts(interaction)] };
    case "addclaim":
      return { embeds: [handleAddClaim()], ephemeral: true };
    case "help":
      return { embeds: [handleHelp()] };
    default:
      return { embeds: [{ title: "Unknown command", description: `\`/${command}\` is not implemented.`, color: 0xff4d4d }] };
  }
}

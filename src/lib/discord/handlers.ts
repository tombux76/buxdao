import { fetchGraveMarketCollectionStats } from "@/lib/gravemarket";
import {
  COLLECTION_CHOICE_MAP,
  getAdminRoleIds,
  getCollectionConfig,
  NFT_SUBCOMMAND_COLLECTION,
  RANK_SUBCOMMAND_COLLECTION,
} from "@/lib/discord/config";
import { lookupNftByNumber } from "@/lib/discord/collection-index";
import {
  lookupNftByRankFromHowRare,
  type HowRareNft,
} from "@/lib/discord/howrare";
import type { APIEmbed } from "@/lib/discord/embed-types";
import {
  collectionGifUrl,
  collectionLogoUrl,
  formatBux,
  formatSol,
  hexColorToEmbed,
  hubLink,
  shortWallet,
  solscanWalletUrl,
} from "@/lib/discord/embed-types";
import { buildNftEmbed } from "@/lib/discord/nft-embed";
import { fetchAsset } from "@/lib/discord/helius";
import {
  getInvokerId,
  getOptionInt,
  getSubcommand,
  getTopLevelString,
  getTopLevelUserId,
  type DiscordInteraction,
} from "@/lib/discord/interaction-types";
import { creditRewardAccount } from "@/lib/holder-rewards/credits";
import { getHubUserIdByDiscordId } from "@/lib/holder-rewards/users";
import { countNftsByCollection, getDiscordDisplayById, getDiscordUserProfile } from "@/lib/discord/user-data";
import type { CollectionConfig } from "@/content/site";

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

async function buildNftCommandEmbed(
  config: CollectionConfig,
  params: {
    mint: string;
    name: string;
    owner: string | null;
    image: string | null;
    howRare?: HowRareNft | null;
  },
): Promise<APIEmbed> {
  return buildNftEmbed(config, params);
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
  const name = live?.content?.metadata?.name?.trim() || indexed.name;
  const image = live?.content?.links?.image ?? indexed.image;

  return buildNftCommandEmbed(config, {
    mint: indexed.mint,
    name,
    owner,
    image,
  });
}

async function handleRank(subcommand: string, rank: number): Promise<APIEmbed> {
  const collectionId = RANK_SUBCOMMAND_COLLECTION[subcommand];
  const config = collectionId ? getCollectionConfig(collectionId) : undefined;
  if (!config) {
    return { title: "Unknown collection", description: "That subcommand is not supported.", color: 0xff4d4d };
  }

  let howRare;
  try {
    howRare = await lookupNftByRankFromHowRare(collectionId, rank);
  } catch {
    return {
      title: `${config.name} rank #${rank}`,
      description: "Could not load rarity data from HowRare.is right now. Try again shortly.",
      ...collectionEmbedImage(config),
    };
  }

  if (!howRare) {
    return {
      title: `${config.name} rank #${rank}`,
      description: "No NFT with this rarity rank on HowRare.is.",
      ...collectionEmbedImage(config),
    };
  }

  const live = await fetchAsset(howRare.mint);
  const owner = live?.ownership?.owner ?? null;
  const name = live?.content?.metadata?.name?.trim() || `${config.name} #${howRare.number}`;
  const image = live?.content?.links?.image ?? null;

  return buildNftCommandEmbed(config, {
    mint: howRare.mint,
    name,
    owner,
    image,
    howRare,
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
    thumbnail: { url: profile.avatarUrl },
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
      { name: "/addclaim", value: "Admin: credit $BUX to a Hub-linked user", inline: false },
      { name: "Holder Hub", value: hubLink(), inline: false },
    ],
  };
}

async function handleAddClaim(interaction: DiscordInteraction): Promise<APIEmbed> {
  if (!isAdmin(interaction)) {
    return {
      title: "Admin only",
      description: "Only admins can use `/addclaim`.",
      color: 0xff4d4d,
    };
  }

  const targetDiscordId = getTopLevelUserId(interaction, "user");
  const amount = getOptionInt(interaction.data?.options ?? [], "amount");
  if (!targetDiscordId || amount == null) {
    return {
      title: "Usage",
      description: "`/addclaim user:<member> amount:<whole BUX>`",
      color: 0xff4d4d,
    };
  }

  if (!Number.isInteger(amount) || amount <= 0) {
    return {
      title: "Invalid amount",
      description: "Amount must be a positive whole number of $BUX.",
      color: 0xff4d4d,
    };
  }

  const hubUserId = await getHubUserIdByDiscordId(targetDiscordId);
  if (!hubUserId) {
    return {
      title: "User not linked",
      description: `That Discord user has not logged into the [Holder Hub](${hubLink()}) yet.`,
      color: 0xff4d4d,
    };
  }

  const result = await creditRewardAccount({
    userId: hubUserId,
    source: "admin",
    amountBux: amount,
    dedupKey: `admin:${interaction.id}`,
    metadata: {
      adminDiscordId: getInvokerId(interaction),
      targetDiscordId,
    },
  });

  if (!result.ok) {
    return {
      title: "Credit failed",
      description: result.reason,
      color: 0xff4d4d,
    };
  }

  if (!result.credited) {
    return {
      title: "Already processed",
      description: "This credit was already applied.",
      color: 0x888888,
    };
  }

  const display = await getDiscordDisplayById(targetDiscordId);
  const displayName = display.username ? `@${display.username.replace(/^@/, "")}` : "Hub user";

  return {
    title: displayName,
    description: `Credited **${formatBux(amount)}** $BUX.\nNew unclaimed balance: **${formatBux(result.newBalanceBux)}** $BUX`,
    color: 0x4dff4d,
    thumbnail: { url: display.avatarUrl },
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
    case "addclaim":
      return { embeds: [await handleAddClaim(interaction)], ephemeral: true };
    case "help":
      return { embeds: [handleHelp()] };
    default:
      return { embeds: [{ title: "Unknown command", description: `\`/${command}\` is not implemented.`, color: 0xff4d4d }] };
  }
}

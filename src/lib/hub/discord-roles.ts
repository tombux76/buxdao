import { getPool } from "@/lib/db";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";

export type HubDiscordRole = {
  id: string;
  display_name: string;
  color: string;
  emoji_url: string | null;
};

type RoleCatalogRow = {
  discord_role_id: string;
  display_name: string;
  color: string;
  emoji_url: string | null;
  sort_order: number;
};

function discordConfig(): { botToken: string; guildId: string } | null {
  const botToken = process.env.DISCORD_BOT_TOKEN?.trim();
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  if (!botToken || !guildId) {
    return null;
  }
  return { botToken, guildId };
}

async function fetchMemberRoleIds(discordUserId: string): Promise<string[] | null> {
  const config = discordConfig();
  if (!config) {
    return null;
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${config.guildId}/members/${discordUserId}`,
    {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`Discord member lookup failed (${response.status})`);
  }

  const member = (await response.json()) as { roles?: string[] };
  return (member.roles ?? []).filter((roleId) => roleId !== config.guildId);
}

async function getRoleCatalog(): Promise<RoleCatalogRow[]> {
  const result = await getPool().query<RoleCatalogRow>(
    `SELECT discord_role_id, display_name, color, emoji_url, sort_order
     FROM discord_role_catalog
     ORDER BY sort_order ASC, display_name ASC`,
  );
  return result.rows;
}

export async function getDiscordRolesForUser(userId: string): Promise<HubDiscordRole[]> {
  const discord = await getLinkedDiscord(userId);
  if (!discord?.discordId) {
    return [];
  }

  try {
    const [memberRoleIds, catalog] = await Promise.all([
      fetchMemberRoleIds(discord.discordId),
      getRoleCatalog(),
    ]);

    if (memberRoleIds === null || catalog.length === 0) {
      return [];
    }

    const memberRoleSet = new Set(memberRoleIds);
    return catalog
      .filter((role) => memberRoleSet.has(role.discord_role_id))
      .map((role) => ({
        id: role.discord_role_id,
        display_name: role.display_name,
        color: role.color,
        emoji_url: role.emoji_url,
      }));
  } catch {
    return [];
  }
}

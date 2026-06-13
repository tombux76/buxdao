import { getPool } from "@/lib/db";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";

export type HubDiscordRole = {
  id: string;
  display_name: string;
  color: string;
  emoji_url: string | null;
};

export type DiscordRolesResult = {
  roles: HubDiscordRole[];
  error?: string;
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

async function fetchMemberRoleIds(discordUserId: string): Promise<{ roleIds: string[]; error?: string }> {
  const config = discordConfig();
  if (!config) {
    return { roleIds: [], error: "Discord bot not configured (DISCORD_BOT_TOKEN / DISCORD_GUILD_ID)" };
  }

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${config.guildId}/members/${discordUserId}`,
    {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: "no-store",
    },
  );

  if (response.status === 404) {
    const guildProbe = await fetch(`https://discord.com/api/v10/guilds/${config.guildId}`, {
      headers: { Authorization: `Bot ${config.botToken}` },
      cache: "no-store",
    });
    if (guildProbe.status === 404) {
      return {
        roleIds: [],
        error: "Discord guild not found — check DISCORD_GUILD_ID and that the bot is in the server",
      };
    }
    return { roleIds: [], error: "Discord account not found in the BUXDAO server" };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return {
      roleIds: [],
      error: `Discord member lookup failed (${response.status})${body ? `: ${body.slice(0, 120)}` : ""}`,
    };
  }

  const member = (await response.json()) as { roles?: string[] };
  return {
    roleIds: (member.roles ?? []).filter((roleId) => roleId !== config.guildId),
  };
}

async function getRoleCatalog(): Promise<RoleCatalogRow[]> {
  const result = await getPool().query<RoleCatalogRow>(
    `SELECT discord_role_id, display_name, color, emoji_url, sort_order
     FROM discord_role_catalog
     ORDER BY sort_order ASC, display_name ASC`,
  );
  return result.rows;
}

export async function getDiscordRolesForUser(userId: string): Promise<DiscordRolesResult> {
  const discord = await getLinkedDiscord(userId);
  if (!discord?.discordId) {
    return { roles: [] };
  }

  try {
    const [memberResult, catalog] = await Promise.all([
      fetchMemberRoleIds(discord.discordId),
      getRoleCatalog(),
    ]);

    if (memberResult.error) {
      return { roles: [], error: memberResult.error };
    }

    if (catalog.length === 0) {
      return { roles: [], error: "Role catalog is empty — run db:seed-roles" };
    }

    const memberRoleSet = new Set(memberResult.roleIds);
    const roles = catalog
      .filter((role) => memberRoleSet.has(role.discord_role_id))
      .map((role) => ({
        id: role.discord_role_id,
        display_name: role.display_name,
        color: role.color,
        emoji_url: role.emoji_url,
      }));

    return { roles };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load Discord roles";
    console.error("[discord-roles]", message);
    return { roles: [], error: message };
  }
}

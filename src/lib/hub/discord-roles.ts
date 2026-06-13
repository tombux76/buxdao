import { getPool } from "@/lib/db";
import { getLinkedDiscord } from "@/lib/hub/discord-profile";

export type HubDiscordRole = {
  id: string;
  name: string;
  type: string;
  color: string;
  emoji_url: string | null;
  collection: string | null;
  display_name: string;
};

type RoleCatalogRow = {
  discord_role_id: string;
  name: string;
  type: string;
  color: string;
  emoji_url: string | null;
  collection: string | null;
  display_name: string;
};

type UserRolesRow = Record<string, unknown> & {
  roles?: unknown;
};

function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value > 0;
  return !!value;
}

function isRoleEligible(userRoles: UserRolesRow, role: RoleCatalogRow): boolean {
  switch (role.type) {
    case "holder":
      switch (role.collection) {
        case "fcked_catz":
          return flag(userRoles.fcked_catz_holder);
        case "money_monsters":
          return flag(userRoles.money_monsters_holder) || flag(userRoles.money_monsters_top_10);
        case "ai_bitbots":
          return flag(userRoles.ai_bitbots_holder);
        case "moneymonsters3d":
          return flag(userRoles.moneymonsters3d_holder) || flag(userRoles.money_monsters_3d_top_10);
        case "celebcatz":
          return flag(userRoles.celebcatz_holder);
        case "shxbb":
          return flag(userRoles.shxbb_holder);
        case "ausqrl":
          return flag(userRoles.ausqrl_holder);
        case "aelxaibb":
          return flag(userRoles.aelxaibb_holder);
        case "airb":
          return flag(userRoles.airb_holder);
        case "clb":
          return flag(userRoles.clb_holder);
        case "ddbot":
          return flag(userRoles.ddbot_holder);
        default:
          return false;
      }
    case "collab":
      switch (role.collection) {
        case "shxbb":
          return flag(userRoles.shxbb_holder);
        case "ausqrl":
          return flag(userRoles.ausqrl_holder);
        case "aelxaibb":
          return flag(userRoles.aelxaibb_holder);
        case "airb":
          return flag(userRoles.airb_holder);
        case "clb":
          return flag(userRoles.clb_holder);
        case "ddbot":
          return flag(userRoles.ddbot_holder);
        default:
          return false;
      }
    case "whale":
      switch (role.collection) {
        case "fcked_catz":
          return flag(userRoles.fcked_catz_whale);
        case "money_monsters":
          return flag(userRoles.money_monsters_whale);
        case "ai_bitbots":
          return flag(userRoles.ai_bitbots_whale);
        case "moneymonsters3d":
          return flag(userRoles.moneymonsters3d_whale);
        default:
          return false;
      }
    case "token":
      if (role.collection === "bux") {
        switch (role.name) {
          case "BUX Beginner":
            return flag(userRoles.bux_beginner);
          case "BUX Builder":
            return flag(userRoles.bux_builder);
          case "BUX Saver":
            return flag(userRoles.bux_saver);
          case "BUX Banker":
            return flag(userRoles.bux_banker);
          default:
            return false;
        }
      }
      return false;
    case "special":
      return role.name === "BUXDAO 5" ? flag(userRoles.buxdao_5) : false;
    case "top10":
      if (role.collection === "money_monsters") {
        return flag(userRoles.money_monsters_top_10);
      }
      if (role.collection === "moneymonsters3d") {
        return flag(userRoles.money_monsters_3d_top_10);
      }
      return false;
    default:
      return false;
  }
}

function mapCatalogRole(role: RoleCatalogRow): HubDiscordRole {
  return {
    id: String(role.discord_role_id),
    name: role.name,
    type: role.type,
    color: role.color,
    emoji_url: role.emoji_url,
    collection: role.collection,
    display_name: role.display_name,
  };
}

function normalizeStoredRoles(stored: unknown): HubDiscordRole[] {
  if (!Array.isArray(stored)) {
    return [];
  }

  const flat = Array.isArray(stored[0]) ? (stored[0] as unknown[]) : stored;
  return flat
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((role) => ({
      id: String(role.id ?? role.discord_role_id ?? role.name ?? ""),
      name: String(role.name ?? ""),
      type: String(role.type ?? ""),
      color: String(role.color ?? "#ffffff"),
      emoji_url: typeof role.emoji_url === "string" ? role.emoji_url : null,
      collection: typeof role.collection === "string" ? role.collection : null,
      display_name: String(role.display_name ?? role.name ?? ""),
    }))
    .filter((role) => role.id && role.display_name);
}

export async function getDiscordRolesForUser(userId: string): Promise<HubDiscordRole[]> {
  const discord = await getLinkedDiscord(userId);
  if (!discord?.discordId) {
    return [];
  }

  const pool = getPool();

  try {
    const userResult = await pool.query<UserRolesRow>(
      `SELECT * FROM user_roles WHERE discord_id = $1`,
      [discord.discordId],
    );

    if ((userResult.rowCount ?? 0) === 0) {
      return [];
    }

    const userRoles = userResult.rows[0];
    const catalogResult = await pool.query<RoleCatalogRow>(
      `SELECT * FROM roles ORDER BY type, collection`,
    );

    const eligibleRoles = catalogResult.rows.filter((role) => isRoleEligible(userRoles, role)).map(mapCatalogRole);

    if (eligibleRoles.length > 0) {
      return eligibleRoles;
    }

    return normalizeStoredRoles(userRoles.roles);
  } catch {
    return [];
  }
}

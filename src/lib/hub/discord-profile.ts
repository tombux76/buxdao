import { getPool } from "@/lib/db";

export type DiscordLinkProfile = {
  discordId: string;
  username: string | null;
  image: string | null;
};

type DiscordAccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

type DiscordApiUser = {
  id: string;
  username?: string;
  global_name?: string | null;
  avatar?: string | null;
};

function discordAvatarUrl(userId: string, avatarHash: string | null | undefined): string | null {
  if (!avatarHash) {
    return null;
  }
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png`;
}

function displayNameFromDiscord(user: DiscordApiUser): string | null {
  return user.global_name ?? user.username ?? null;
}

export function parseDiscordProfile(
  profile: unknown,
  providerAccountId?: string,
): DiscordLinkProfile | null {
  if (!profile || typeof profile !== "object") {
    return providerAccountId
      ? { discordId: providerAccountId, username: null, image: null }
      : null;
  }

  const record = profile as Record<string, unknown>;
  const discordId =
    (typeof record.id === "string" ? record.id : null) ??
    providerAccountId ??
    null;
  if (!discordId) {
    return null;
  }

  const username =
    (typeof record.global_name === "string" ? record.global_name : null) ??
    (typeof record.name === "string" ? record.name : null) ??
    (typeof record.username === "string" ? record.username : null);

  const image =
    (typeof record.image === "string" ? record.image : null) ??
    discordAvatarUrl(discordId, typeof record.avatar === "string" ? record.avatar : null);

  return { discordId, username, image };
}

export async function fetchDiscordMe(accessToken: string): Promise<DiscordLinkProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[discord] users/@me failed:", response.status, detail.slice(0, 200));
      return null;
    }
    const user = (await response.json()) as DiscordApiUser;
    return {
      discordId: user.id,
      username: displayNameFromDiscord(user),
      image: discordAvatarUrl(user.id, user.avatar),
    };
  } catch (error) {
    console.error("[discord] users/@me error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshDiscordAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const clientId = process.env.AUTH_DISCORD_ID;
  const clientSecret = process.env.AUTH_DISCORD_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  try {
    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
  } catch {
    return null;
  }
}

export async function getDiscordAccountRow(userId: string): Promise<DiscordAccountRow | null> {
  const result = await getPool().query<DiscordAccountRow>(
    `SELECT access_token, refresh_token, expires_at
     FROM accounts
     WHERE "userId" = $1 AND provider = 'discord'
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

async function persistDiscordTokens(
  userId: string,
  tokens: { access_token: string; refresh_token?: string; expires_in?: number },
): Promise<void> {
  const expiresAt =
    tokens.expires_in != null ? Math.floor(Date.now() / 1000) + tokens.expires_in : null;

  await getPool().query(
    `UPDATE accounts SET
      access_token = $1,
      refresh_token = COALESCE($2, refresh_token),
      expires_at = COALESCE($3, expires_at)
     WHERE "userId" = $4 AND provider = 'discord'`,
    [tokens.access_token, tokens.refresh_token ?? null, expiresAt, userId],
  );
}

export async function getValidDiscordAccessToken(userId: string): Promise<string | null> {
  const row = await getDiscordAccountRow(userId);
  if (!row?.access_token) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const expired = row.expires_at != null && row.expires_at <= now + 60;

  if (!expired) {
    return row.access_token;
  }

  if (!row.refresh_token) {
    return row.access_token;
  }

  const refreshed = await refreshDiscordAccessToken(row.refresh_token);
  if (!refreshed?.access_token) {
    return row.access_token;
  }

  await persistDiscordTokens(userId, refreshed);
  return refreshed.access_token;
}

export async function saveDiscordProfile(
  userId: string,
  profile: unknown,
  providerAccountId?: string,
  accessToken?: string | null,
): Promise<void> {
  let resolved = parseDiscordProfile(profile, providerAccountId);
  if (!resolved?.username || !resolved.image) {
    const token = accessToken ?? (await getValidDiscordAccessToken(userId));
    if (token) {
      const fetched = await fetchDiscordMe(token);
      if (fetched) {
        resolved = fetched;
      }
    }
  }

  if (!resolved) {
    return;
  }

  await getPool().query(
    `UPDATE users SET
      discord_id = $1,
      discord_username = $2,
      discord_image = $3,
      name = COALESCE($2, name),
      image = COALESCE($3, image),
      updated_at = now()
     WHERE id = $4`,
    [resolved.discordId, resolved.username, resolved.image, userId],
  );
}

export async function syncDiscordProfile(userId: string, force = false): Promise<void> {
  const pool = getPool();
  const userResult = await pool.query<{
    discord_id: string | null;
    discord_username: string | null;
    discord_image: string | null;
  }>(`SELECT discord_id, discord_username, discord_image FROM users WHERE id = $1`, [userId]);

  const userRow = userResult.rows[0];
  if (!userRow) {
    return;
  }

  if (!userRow.discord_id) {
    const accountResult = await pool.query<{ providerAccountId: string }>(
      `SELECT "providerAccountId" FROM accounts WHERE "userId" = $1 AND provider = 'discord' LIMIT 1`,
      [userId],
    );
    const discordId = accountResult.rows[0]?.providerAccountId;
    if (discordId) {
      await pool.query(`UPDATE users SET discord_id = $1 WHERE id = $2`, [discordId, userId]);
    } else {
      return;
    }
  }

  if (!force && userRow.discord_username && userRow.discord_image) {
    return;
  }

  const accessToken = await getValidDiscordAccessToken(userId);
  if (!accessToken) {
    return;
  }

  const fetched = await fetchDiscordMe(accessToken);
  if (!fetched) {
    return;
  }

  await pool.query(
    `UPDATE users SET
      discord_id = $1,
      discord_username = $2,
      discord_image = $3,
      name = COALESCE($2, name),
      image = COALESCE($3, image),
      updated_at = now()
     WHERE id = $4`,
    [fetched.discordId, fetched.username, fetched.image, userId],
  );
}

export type LinkedDiscord = {
  discordId: string;
  username: string | null;
  image: string | null;
};

export async function getLinkedDiscord(userId: string): Promise<LinkedDiscord | null> {
  const result = await getPool().query<{
    discord_id: string | null;
    discord_username: string | null;
    discord_image: string | null;
  }>(`SELECT discord_id, discord_username, discord_image FROM users WHERE id = $1`, [userId]);

  const row = result.rows[0];
  if (!row?.discord_id) {
    return null;
  }

  return {
    discordId: row.discord_id,
    username: row.discord_username,
    image: row.discord_image,
  };
}

import type { TwitterProfile } from "next-auth/providers/twitter";
import { getPool } from "@/lib/db";

export type TwitterLinkProfile = {
  username: string | null;
  image: string | null;
};

type TwitterAccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

export async function fetchTwitterMe(accessToken: string): Promise<TwitterLinkProfile | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(
      "https://api.x.com/2/users/me?user.fields=profile_image_url,username",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[twitter] users/me failed:", response.status, detail.slice(0, 200));
      return null;
    }
    const payload = (await response.json()) as TwitterProfile;
    return {
      username: payload.data?.username ?? null,
      image: payload.data?.profile_image_url ?? null,
    };
  } catch (error) {
    console.error("[twitter] users/me error:", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseTwitterProfile(profile: unknown): TwitterLinkProfile {
  const twitterProfile = profile as TwitterProfile | undefined;
  if (twitterProfile?.data) {
    return {
      username: twitterProfile.data.username ?? null,
      image: twitterProfile.data.profile_image_url ?? null,
    };
  }

  if (profile && typeof profile === "object") {
    const record = profile as Record<string, unknown>;
    if (typeof record.username === "string") {
      return {
        username: record.username,
        image: typeof record.profile_image_url === "string" ? record.profile_image_url : null,
      };
    }
    if (typeof record.name === "string" && !record.name.includes(" ")) {
      return {
        username: record.name.replace(/^@/, ""),
        image: typeof record.image === "string" ? record.image : null,
      };
    }
  }

  return { username: null, image: null };
}

async function refreshTwitterAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number } | null> {
  const clientId = process.env.AUTH_TWITTER_ID;
  const clientSecret = process.env.AUTH_TWITTER_SECRET;
  if (!clientId || !clientSecret) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });

  try {
    const response = await fetch("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("[twitter] token refresh failed:", response.status, detail.slice(0, 200));
      return null;
    }
    return (await response.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
  } catch (error) {
    console.error("[twitter] token refresh error:", error);
    return null;
  }
}

export async function getTwitterAccountRow(userId: string): Promise<TwitterAccountRow | null> {
  const result = await getPool().query<TwitterAccountRow>(
    `SELECT access_token, refresh_token, expires_at
     FROM accounts
     WHERE "userId" = $1 AND provider = 'twitter'
     LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function persistTwitterTokens(
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
     WHERE "userId" = $4 AND provider = 'twitter'`,
    [tokens.access_token, tokens.refresh_token ?? null, expiresAt, userId],
  );
}

/** Returns a valid user access token, refreshing when expired. */
export async function getValidTwitterAccessToken(userId: string): Promise<string | null> {
  const row = await getTwitterAccountRow(userId);
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

  const refreshed = await refreshTwitterAccessToken(row.refresh_token);
  if (!refreshed?.access_token) {
    return row.access_token;
  }

  await persistTwitterTokens(userId, refreshed);
  return refreshed.access_token;
}

export async function resolveTwitterLinkProfile(
  profile: unknown,
  userId: string,
  accessToken?: string | null,
): Promise<TwitterLinkProfile> {
  const parsed = parseTwitterProfile(profile);
  if (parsed.username) {
    return parsed;
  }

  const token = accessToken ?? (await getValidTwitterAccessToken(userId));
  if (!token) {
    return parsed;
  }

  const fetched = await fetchTwitterMe(token);
  return fetched ?? parsed;
}

export function formatTwitterLabel(username: string | null, userId: string): string {
  if (username && username !== userId && !/^\d+$/.test(username)) {
    return username.startsWith("@") ? username : `@${username}`;
  }
  return "X linked";
}

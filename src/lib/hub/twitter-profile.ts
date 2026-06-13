import type { TwitterProfile } from "next-auth/providers/twitter";

export type TwitterLinkProfile = {
  username: string | null;
  image: string | null;
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
      return null;
    }
    const payload = (await response.json()) as TwitterProfile;
    return {
      username: payload.data?.username ?? null,
      image: payload.data?.profile_image_url ?? null,
    };
  } catch {
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
  }

  return { username: null, image: null };
}

export async function resolveTwitterLinkProfile(
  profile: unknown,
  accessToken?: string | null,
): Promise<TwitterLinkProfile> {
  const parsed = parseTwitterProfile(profile);
  if (parsed.username) {
    return parsed;
  }
  if (!accessToken) {
    return parsed;
  }
  const fetched = await fetchTwitterMe(accessToken);
  return fetched ?? parsed;
}

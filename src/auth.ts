import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Discord from "next-auth/providers/discord";
import Twitter from "next-auth/providers/twitter";
import type { TwitterProfile } from "next-auth/providers/twitter";
import { BuxdaoPostgresAdapter } from "@/lib/auth/pg-adapter";
import { getPool } from "@/lib/db";
import { saveDiscordProfile } from "@/lib/hub/discord-profile";
import { saveTwitterLink } from "@/lib/hub/linked-social";
import { ensureRewardAccount } from "@/lib/holder-rewards/accounts";

const providers: Provider[] = [
  Discord({
    // Discord now returns iss=https://discord.com on the callback. Auth.js
    // otherwise expects https://authjs.dev and rejects the login.
    issuer: "https://discord.com",
    authorization: { params: { scope: "identify" } },
  }),
];

if (process.env.AUTH_TWITTER_ID && process.env.AUTH_TWITTER_SECRET) {
  providers.push(
    Twitter({
      clientId: process.env.AUTH_TWITTER_ID,
      clientSecret: process.env.AUTH_TWITTER_SECRET,
      userinfo: "https://api.x.com/2/users/me?user.fields=profile_image_url,username",
      profile(profile: TwitterProfile) {
        return {
          id: profile.data.id,
          name: profile.data.username ?? profile.data.name,
          image: profile.data.profile_image_url,
        };
      },
    }),
  );
}

// AUTH_URL is the apex host. Vercel 308s every apex request to www, and that
// extra hop drops the OAuth cookie on the way back from Discord. Send Discord
// straight to www so the callback is one top-level request.
const configuredAuthUrl = process.env.AUTH_URL?.replace(/\/$/, "");
if (configuredAuthUrl === "https://buxdao.com") {
  process.env.AUTH_URL = "https://www.buxdao.com";
}

const crossSiteCookie = { sameSite: "none" as const, secure: true };

function canonicalOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "buxdao.com") {
      url.hostname = "www.buxdao.com";
    }
    return url.origin;
  } catch {
    return baseUrl;
  }
}

function authErrorText(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error).slice(0, 4000);
  }
  const cause = error.cause;
  let causeText = "";
  if (cause instanceof Error) {
    causeText = `${cause.name}: ${cause.message}`;
  } else if (cause != null) {
    try {
      causeText = JSON.stringify(cause);
    } catch {
      causeText = String(cause);
    }
  }
  return `${error.name}: ${error.message}${causeText ? ` | ${causeText}` : ""}`.slice(0, 4000);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: BuxdaoPostgresAdapter(getPool()),
  providers,
  trustHost: true,
  logger: {
    error(error) {
      console.error("[auth]", error);
      const message = authErrorText(error);
      void (async () => {
        const pool = getPool();
        await pool.query(`
          CREATE TABLE IF NOT EXISTS auth_error_log (
            id SERIAL PRIMARY KEY,
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
          )
        `);
        await pool.query(`INSERT INTO auth_error_log (message) VALUES ($1)`, [message]);
      })().catch((logError) => {
        console.error("[auth] failed to store error", logError);
      });
    },
  },
  cookies:
    process.env.NODE_ENV === "production"
      ? {
          sessionToken: { options: crossSiteCookie },
          callbackUrl: { options: crossSiteCookie },
          state: { options: crossSiteCookie },
          pkceCodeVerifier: { options: crossSiteCookie },
          nonce: { options: crossSiteCookie },
        }
      : undefined,
  pages: {
    signIn: "/hub",
  },
  callbacks: {
    redirect({ url, baseUrl }) {
      const origin = canonicalOrigin(baseUrl);
      if (url.startsWith("/")) {
        return `${origin}${url}`;
      }
      try {
        const target = new URL(url);
        const base = new URL(baseUrl);
        if (
          target.hostname === base.hostname ||
          target.hostname === "buxdao.com" ||
          target.hostname === "www.buxdao.com"
        ) {
          if (target.hostname === "buxdao.com") {
            target.hostname = "www.buxdao.com";
          }
          return target.toString();
        }
      } catch {
        // Fall through to the canonical origin.
      }
      return origin;
    },
    session({ session, user }) {
      if (session.user) {
        session.user.id = String(user.id);
      }
      return session;
    },
    async signIn({ account }) {
      if (account?.provider !== "twitter") {
        return true;
      }

      const session = await auth();
      if (!session?.user?.id) {
        return "/hub?error=discord_required";
      }

      return true;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      if (!user.id || !account) {
        return;
      }

      const userId = String(user.id);
      await getPool().query(`UPDATE users SET updated_at = now() WHERE id = $1`, [userId]);

      if (account.provider === "discord") {
        await saveDiscordProfile(userId, profile, account.providerAccountId, account.access_token);
        await ensureRewardAccount(userId);
        return;
      }

      if (account.provider === "twitter") {
        const existing = await getPool().query<{ userId: number }>(
          `SELECT "userId" FROM accounts WHERE provider = 'twitter' AND "providerAccountId" = $1 LIMIT 1`,
          [account.providerAccountId],
        );
        const linkedUserId = existing.rows[0]?.userId;
        if (linkedUserId != null && String(linkedUserId) === userId) {
          await saveTwitterLink(userId, account.providerAccountId, profile, account.access_token);
        }
      }
    },
    async linkAccount({ user, account, profile }) {
      const userId = String(user.id);

      if (account.provider === "discord") {
        await saveDiscordProfile(userId, profile, account.providerAccountId, account.access_token);
        await ensureRewardAccount(userId);
        return;
      }

      if (account.provider === "twitter") {
        await saveTwitterLink(userId, account.providerAccountId, profile, account.access_token);
      }
    },
  },
});

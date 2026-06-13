import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Discord from "next-auth/providers/discord";
import Twitter from "next-auth/providers/twitter";
import type { TwitterProfile } from "next-auth/providers/twitter";
import PostgresAdapter from "@auth/pg-adapter";
import { getPool } from "@/lib/db";
import { saveTwitterLink } from "@/lib/hub/linked-social";

const providers: Provider[] = [
  Discord({
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(getPool()),
  providers,
  trustHost: true,
  pages: {
    signIn: "/hub",
  },
  callbacks: {
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
      if (user.id) {
        await getPool().query(`UPDATE users SET updated_at = now() WHERE id = $1`, [user.id]);
      }

      if (account?.provider === "twitter" && user.id) {
        const userId = String(user.id);
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
      if (account.provider !== "twitter") {
        return;
      }

      const userId = String(user.id);
      await saveTwitterLink(userId, account.providerAccountId, profile, account.access_token);
    },
  },
});

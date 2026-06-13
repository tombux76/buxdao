import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Discord from "next-auth/providers/discord";
import Twitter from "next-auth/providers/twitter";
import type { TwitterProfile } from "next-auth/providers/twitter";
import PostgresAdapter from "@auth/pg-adapter";
import { getPool } from "@/lib/db";

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
          name: profile.data.name,
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

      const pool = getPool();
      const existing = await pool.query<{ id: number }>(
        `SELECT id FROM accounts WHERE "userId" = $1 AND provider = 'twitter' LIMIT 1`,
        [session.user.id],
      );
      if ((existing.rowCount ?? 0) > 0) {
        return "/hub?error=x_already_linked";
      }

      return true;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await getPool().query(`UPDATE users SET updated_at = now() WHERE id = $1`, [user.id]);
      }
    },
    async linkAccount({ user, account, profile }) {
      if (account.provider !== "twitter") {
        return;
      }

      const twitterProfile = profile as TwitterProfile | undefined;
      const username = twitterProfile?.data?.username;
      await getPool().query(
        `UPDATE users SET x_username = $1, x_user_id = $2, updated_at = now() WHERE id = $3`,
        [username ?? null, account.providerAccountId, user.id],
      );
    },
  },
});

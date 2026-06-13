import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import PostgresAdapter from "@auth/pg-adapter";
import { getPool } from "@/lib/db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PostgresAdapter(getPool()),
  providers: [
    Discord({
      authorization: { params: { scope: "identify" } },
    }),
  ],
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
  },
  events: {
    async signIn({ user }) {
      if (user.id) {
        await getPool().query(`UPDATE users SET updated_at = now() WHERE id = $1`, [user.id]);
      }
    },
  },
});

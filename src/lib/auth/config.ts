import type { NextAuthConfig } from "next-auth";

export const twitterLinkEnabled =
  Boolean(process.env.AUTH_TWITTER_ID) && Boolean(process.env.AUTH_TWITTER_SECRET);

export const authConfig = {
  twitterLinkEnabled,
} satisfies { twitterLinkEnabled: boolean };

export type AuthConfig = typeof authConfig;

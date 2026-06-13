"use client";

import { useSession } from "next-auth/react";

export function useDiscordSession() {
  const { data: session, status } = useSession();
  const discordConnected = status === "authenticated" && !!session?.user;

  return {
    session,
    status,
    discordConnected,
    discordRequiredHint: "Log in with Discord first",
  };
}

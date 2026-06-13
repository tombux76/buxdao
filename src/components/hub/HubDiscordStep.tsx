"use client";

import { useSession } from "next-auth/react";
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton";

export function HubDiscordStep() {
  const { data: session, status } = useSession();
  const connected = status === "authenticated" && !!session?.user;

  return (
    <div className="mt-3">
      {connected ? (
        <p className="text-sm font-medium text-[#5865F2]">✓ Connected as {session.user.name}</p>
      ) : (
        <DiscordAuthButton callbackUrl="/hub" />
      )}
    </div>
  );
}

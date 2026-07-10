"use client";

import { signOut, useSession } from "next-auth/react";
import { DisconnectButton } from "@/components/hub/ProfileConnectActions";
import { Card } from "@/components/ui/Card";
import { useHubProfiles } from "@/hooks/useHubProfiles";

export function HubProfileCard() {
  const { data: session, status } = useSession();
  const { discord: discordProfile } = useHubProfiles();
  const isAuthenticated = status === "authenticated" && !!session?.user;

  if (!isAuthenticated) {
    return (
      <Card className="border border-dashed border-border p-4">
        <p className="text-sm text-muted">
          Your profile appears here after Discord login. Holdings, roles, claim balance, and cashout
          unlock as you connect and verify.
        </p>
      </Card>
    );
  }

  const displayName = discordProfile?.username ?? "Discord user";
  const displayImage = discordProfile?.image;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-4 border border-[#5865F2]/30 bg-[#5865F2]/5 p-4">
      {displayImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={displayImage}
          alt=""
          className="h-14 w-14 rounded-full ring-2 ring-[#5865F2]/40"
        />
      ) : (
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#5865F2]/20 text-xl font-semibold text-[#5865F2]">
          {displayName.charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold">{displayName}</p>
        <p className="text-sm text-[#5865F2]">Discord connected</p>
      </div>
      <DisconnectButton
        title="Disconnect Discord"
        onClick={() => signOut({ callbackUrl: "/hub" })}
      />
      </div>
    </Card>
  );
}

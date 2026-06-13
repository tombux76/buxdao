"use client";

import { signOut, useSession } from "next-auth/react";
import { DisconnectButton } from "@/components/hub/ProfileConnectActions";
import { useHubProfiles } from "@/hooks/useHubProfiles";

export function HubProfileCard() {
  const { data: session, status } = useSession();
  const { discord: discordProfile } = useHubProfiles();
  const isAuthenticated = status === "authenticated" && !!session?.user;

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-muted">
        Use the steps above to connect your accounts. Your holdings, roles, and $BUX cashout value
        will appear here once you&apos;re set up.
      </p>
    );
  }

  const displayName = discordProfile?.username ?? session.user.name ?? "Discord user";
  const displayImage = discordProfile?.image ?? session.user.image;

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/5 p-4">
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
  );
}

"use client";

import { useSession } from "next-auth/react";
import { ProfileConnectActions } from "@/components/hub/ProfileConnectActions";
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton";

export function HubProfileCard() {
  const { data: session, status } = useSession();
  const isAuthenticated = status === "authenticated" && !!session?.user;

  return (
    <div className="space-y-4">
      {isAuthenticated ? (
        <div className="flex items-center gap-4 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/5 p-4">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-14 w-14 rounded-full ring-2 ring-[#5865F2]/40"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#5865F2]/20 text-xl font-semibold text-[#5865F2]">
              {(session.user.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{session.user.name ?? "Discord user"}</p>
            <p className="text-sm text-[#5865F2]">Discord connected</p>
          </div>
          <DiscordAuthButton compact connectedClassName="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground" />
        </div>
      ) : (
        <p className="text-sm text-muted">
          Connect your accounts to view holdings, roles, and $BUX cashout value. Only members who
          log in here count as active on the new site.
        </p>
      )}

      <ProfileConnectActions stacked={false} />

      {!isAuthenticated && (
        <p className="text-xs text-muted">
          Start with <span className="text-[#5865F2]">Login</span>, then optionally{" "}
          <span className="text-foreground">Link</span> X and{" "}
          <span className="text-accent-cyan">Connect</span> your wallet. Join our{" "}
          <a
            href="https://discord.com/invite/2dXNjyr593"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent-cyan underline-offset-2 hover:underline"
          >
            Discord server
          </a>{" "}
          to verify holder roles.
        </p>
      )}
    </div>
  );
}

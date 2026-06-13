"use client";

import { useSession } from "next-auth/react";
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton";

export function HubProfileCard() {
  const { data: session, status } = useSession();

  return (
    <div className="space-y-4">
      {status === "authenticated" && session?.user ? (
        <div className="flex items-center gap-4 rounded-xl border border-border bg-bg-deep/50 p-4">
          {session.user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.user.image}
              alt=""
              className="h-12 w-12 rounded-full ring-2 ring-[#5865F2]/40"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#5865F2]/20 text-lg font-semibold text-[#5865F2]">
              {(session.user.name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{session.user.name ?? "Discord user"}</p>
            <p className="text-xs text-muted">Connected · member #{session.user.id}</p>
          </div>
          <DiscordAuthButton compact connectedClassName="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground" />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#5865F2]/30 bg-[#5865F2]/5 p-4">
          <p className="mb-3 text-sm text-muted">
            Sign in with Discord to set up your Holder Hub profile. Only members who log in here
            count as active on the new site.
          </p>
          <DiscordAuthButton />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!session?.user && <DiscordAuthButton />}
        <button
          type="button"
          disabled
          className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-60"
        >
          Connect X (soon)
        </button>
        <button
          type="button"
          disabled
          className="rounded-xl border border-border px-4 py-2 text-sm text-muted opacity-60"
        >
          Connect wallet (soon)
        </button>
      </div>
    </div>
  );
}

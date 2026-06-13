"use client";

import { useSession } from "next-auth/react";
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
        <div className="rounded-xl border border-dashed border-[#5865F2]/40 bg-[#5865F2]/5 p-5 text-center">
          <p className="mb-1 text-lg font-semibold">Connect Discord to get started</p>
          <p className="mb-4 text-sm text-muted">
            Sign in to activate your Holder Hub profile. Only members who log in here count as
            active on the new site.
          </p>
          <DiscordAuthButton className="mx-auto inline-flex items-center justify-center gap-2 rounded-xl border border-[#5865F2] bg-[#5865F2] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4752C4]" />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
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

      {!isAuthenticated && (
        <p className="text-xs text-muted">
          After connecting, join our{" "}
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

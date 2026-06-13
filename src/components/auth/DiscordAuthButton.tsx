"use client";

import { signIn, signOut, useSession } from "next-auth/react";

type DiscordAuthButtonProps = {
  className?: string;
  connectedClassName?: string;
  compact?: boolean;
};

export function DiscordAuthButton({
  className = "rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2 text-sm text-[#5865F2] transition hover:bg-[#5865F2]/20",
  connectedClassName = "rounded-xl border border-border bg-bg-surface px-4 py-2 text-sm text-foreground transition hover:bg-bg-deep",
  compact = false,
}: DiscordAuthButtonProps) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <button type="button" disabled className={`${className} opacity-60`}>
        {compact ? "…" : "Loading…"}
      </button>
    );
  }

  if (session?.user) {
    const label = compact
      ? "Sign out"
      : session.user.name
        ? `Sign out (${session.user.name})`
        : "Sign out";

    return (
      <button type="button" onClick={() => signOut()} className={connectedClassName}>
        {label}
      </button>
    );
  }

  return (
    <button type="button" onClick={() => signIn("discord")} className={className}>
      {compact ? "Discord" : "Connect Discord"}
    </button>
  );
}

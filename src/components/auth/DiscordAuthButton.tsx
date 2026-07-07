"use client";

import { useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

type DiscordAuthButtonProps = {
  className?: string;
  connectedClassName?: string;
  compact?: boolean;
  /** Sidebar-style row with avatar when logged in */
  profile?: boolean;
  callbackUrl?: string;
};

function UserAvatar({ name, image, size = "md" }: { name?: string | null; image?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={`${dim.split(" ")[0]} ${dim.split(" ")[1]} shrink-0 rounded-full`} />
    );
  }
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-[#5865F2]/20 font-semibold text-[#5865F2]`}
    >
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

export function DiscordAuthButton({
  className = "inline-flex items-center justify-center gap-2 rounded-xl border border-[#5865F2]/40 bg-[#5865F2]/10 px-4 py-2 text-sm font-medium text-[#5865F2] transition hover:bg-[#5865F2]/20",
  connectedClassName = "inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-bg-surface px-4 py-2 text-sm text-foreground transition hover:bg-bg-deep",
  compact = false,
  profile = false,
  callbackUrl = "/hub",
}: DiscordAuthButtonProps) {
  const { data: session, status } = useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || status === "loading") {
    return (
      <button type="button" disabled className={`${className} opacity-60`} aria-busy="true">
        {profile ? "Loading…" : compact ? "…" : "Loading…"}
      </button>
    );
  }

  if (session?.user) {
    if (profile) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-[#5865F2]/30 bg-bg-surface p-2">
          <UserAvatar name={session.user.name} image={session.user.image} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{session.user.name ?? "Discord"}</p>
            <p className="text-[10px] text-muted">Signed in</p>
          </div>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/hub" })}
            className="shrink-0 rounded-lg px-2 py-1 text-[10px] text-muted transition hover:bg-bg-deep hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      );
    }

    if (compact) {
      return (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/hub" })}
          className={connectedClassName}
          title={`Signed in as ${session.user.name ?? "Discord"} — sign out`}
        >
          <UserAvatar name={session.user.name} image={session.user.image} size="sm" />
        </button>
      );
    }

    const label = session.user.name ? `Sign out (${session.user.name})` : "Sign out";

    return (
      <button type="button" onClick={() => signOut({ callbackUrl: "/hub" })} className={connectedClassName}>
        {label}
      </button>
    );
  }

  return (
    <button type="button" onClick={() => signIn("discord", { callbackUrl })} className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/discord.svg" alt="" className="h-4 w-4" />
      {compact ? "Connect" : "Connect Discord"}
    </button>
  );
}

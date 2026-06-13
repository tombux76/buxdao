"use client";

import { Wallet } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type ProfileConnectActionsProps = {
  /** Stack vertically (sidebar) vs row (hub dashboard) */
  stacked?: boolean;
};

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55";

function btnClass(stacked: boolean) {
  return stacked ? `${btnBase} w-full` : `${btnBase} min-w-0 flex-1 sm:flex-initial sm:min-w-[7.5rem]`;
}

export function ProfileConnectActions({ stacked = false }: ProfileConnectActionsProps) {
  const { data: session, status } = useSession();
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const discordConnected = status === "authenticated" && !!session?.user;
  const layout = stacked ? "flex flex-col gap-2" : "flex gap-2 sm:gap-3";

  return (
    <div className={layout}>
      {/* 1. Login — Discord */}
      {discordConnected ? (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/hub" })}
          className={`${btnClass(stacked)} border border-[#5865F2]/50 bg-[#5865F2]/15 text-[#5865F2] hover:bg-[#5865F2]/25`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/discord.svg" alt="" className="h-4 w-4" />
          {session.user.name ? `Logged in · ${session.user.name}` : "Logged in"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => signIn("discord", { callbackUrl: "/hub" })}
          className={`${btnClass(stacked)} bg-[#5865F2] text-white hover:bg-[#4752C4]`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/discord.svg" alt="" className="h-4 w-4 brightness-0 invert" />
          Login
        </button>
      )}

      {/* 2. Link — X */}
      <button
        type="button"
        disabled
        title="X linking coming soon"
        className={`${btnClass(stacked)} border border-neutral-700 bg-black text-white hover:bg-neutral-900`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/x-logo.png" alt="" className="h-4 w-4 object-contain" />
        Link
      </button>

      {/* 3. Connect — wallet */}
      {connected && publicKey ? (
        <button
          type="button"
          onClick={() => disconnect()}
          className={`${btnClass(stacked)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep hover:opacity-90`}
        >
          <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
          {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setVisible(true)}
          className={`${btnClass(stacked)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep hover:opacity-90`}
        >
          <Wallet className="h-4 w-4" strokeWidth={2.25} />
          Connect
        </button>
      )}
    </div>
  );
}

/** Branded Discord login only — for setup step 1 */
export function DiscordLoginButton() {
  const { data: session, status } = useSession();
  const connected = status === "authenticated" && !!session?.user;

  if (connected) {
    return (
      <p className="text-sm font-medium text-[#5865F2]">✓ Logged in as {session.user.name}</p>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("discord", { callbackUrl: "/hub" })}
      className={`${btnBase} w-auto bg-[#5865F2] text-white hover:bg-[#4752C4]`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/discord.svg" alt="" className="h-4 w-4 brightness-0 invert" />
      Login
    </button>
  );
}

"use client";

import { Wallet } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55";

function btnClass(fullWidth: boolean) {
  return fullWidth ? `${btnBase} w-full` : `${btnBase} w-auto`;
}

export function DiscordLoginButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { data: session, status } = useSession();
  const connected = status === "authenticated" && !!session?.user;

  if (connected) {
    return (
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/hub" })}
        className={`${btnClass(fullWidth)} border border-[#5865F2]/50 bg-[#5865F2]/15 text-[#5865F2] hover:bg-[#5865F2]/25`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/discord.svg" alt="" className="h-4 w-4" />
        {session.user.name ? `Logged in · ${session.user.name}` : "Logged in"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signIn("discord", { callbackUrl: "/hub" })}
      className={`${btnClass(fullWidth)} bg-[#5865F2] text-white hover:bg-[#4752C4]`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/discord.svg" alt="" className="h-4 w-4 brightness-0 invert" />
      Login
    </button>
  );
}

export function XLinkButton({ fullWidth = false }: { fullWidth?: boolean }) {
  return (
    <button
      type="button"
      disabled
      title="X linking coming soon"
      className={`${btnClass(fullWidth)} border border-neutral-700 bg-black text-white hover:bg-neutral-900`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/x-logo.png" alt="" className="h-4 w-4 object-contain" />
      Link
    </button>
  );
}

export function HubWalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep hover:opacity-90`}
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setVisible(true)}
      className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep hover:opacity-90`}
    >
      <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
      Connect
    </button>
  );
}

type ProfileConnectActionsProps = {
  stacked?: boolean;
};

export function ProfileConnectActions({ stacked = false }: ProfileConnectActionsProps) {
  const layout = stacked ? "flex flex-col gap-2" : "flex gap-2 sm:gap-3";

  return (
    <div className={layout}>
      <DiscordLoginButton fullWidth={stacked} />
      <XLinkButton fullWidth={stacked} />
      <HubWalletButton fullWidth={stacked} />
    </div>
  );
}

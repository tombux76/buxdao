"use client";

import { useState } from "react";
import { Wallet, X as XIcon } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useDiscordSession } from "@/hooks/useDiscordSession";
import { useLinkedSocial } from "@/hooks/useLinkedSocial";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-55";

function btnClass(fullWidth: boolean) {
  return fullWidth ? `${btnBase} w-full` : `${btnBase} w-auto`;
}

const disconnectBtnClass =
  "flex shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 hover:text-red-300";

export function DisconnectButton({
  onClick,
  title,
  size = "md",
}: {
  onClick: () => void;
  title: string;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${disconnectBtnClass} ${dim}`}
      title={title}
      aria-label={title}
    >
      <XIcon className={icon} strokeWidth={2.25} />
    </button>
  );
}

export function DiscordLoginButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { data: session, status } = useSession();
  const connected = status === "authenticated" && !!session?.user;

  if (connected) {
    return (
      <div
        className={`${btnClass(fullWidth)} border border-[#5865F2]/50 bg-[#5865F2]/15 text-[#5865F2]`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/discord.svg" alt="" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">
          {session.user.name ?? "Discord"}
        </span>
        <DisconnectButton
          size="sm"
          title="Disconnect Discord"
          onClick={() => signOut({ callbackUrl: "/hub" })}
        />
      </div>
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
  const { discordConnected, discordRequiredHint } = useDiscordSession();
  const { twitter, twitterEnabled, loading, unlinkTwitter } = useLinkedSocial();
  const [unlinking, setUnlinking] = useState(false);

  if (!discordConnected) {
    return (
      <button
        type="button"
        disabled
        title={discordRequiredHint}
        className={`${btnClass(fullWidth)} border border-neutral-700 bg-black text-white`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/x-logo.png" alt="" className="h-4 w-4 object-contain" />
        Link
      </button>
    );
  }

  if (twitter) {
    return (
      <div
        className={`${btnClass(fullWidth)} border border-neutral-700 bg-black text-white`}
      >
        {twitter.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={twitter.image} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/x-logo.png" alt="" className="h-4 w-4 shrink-0 object-contain" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{twitter.label}</span>
        <DisconnectButton
          size="sm"
          title="Unlink X"
          onClick={() => {
            setUnlinking(true);
            void unlinkTwitter()
              .catch(() => undefined)
              .finally(() => setUnlinking(false));
          }}
        />
      </div>
    );
  }

  const disabled = loading || unlinking || !twitterEnabled;
  const title = !twitterEnabled
    ? "X linking is not configured"
    : loading
      ? "Loading…"
      : "Link your X account";

  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={() => signIn("twitter", { callbackUrl: "/hub" })}
      className={`${btnClass(fullWidth)} border border-neutral-700 bg-black text-white hover:bg-neutral-900`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/x-logo.png" alt="" className="h-4 w-4 object-contain" />
      Link
    </button>
  );
}

export function HubWalletButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const { discordConnected, discordRequiredHint } = useDiscordSession();
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (!discordConnected) {
    return (
      <button
        type="button"
        disabled
        title={discordRequiredHint}
        className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep`}
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        Connect
      </button>
    );
  }

  if (connected && publicKey) {
    const address = `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`;
    return (
      <div
        className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep`}
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 flex-1 truncate text-left font-mono">{address}</span>
        <DisconnectButton size="sm" title="Disconnect wallet" onClick={() => disconnect()} />
      </div>
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

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Wallet, X as XIcon } from "lucide-react";
import { signIn, signOut, useSession } from "next-auth/react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { useWallet, type Wallet as AdapterWallet } from "@solana/wallet-adapter-react";
import { useDiscordSession } from "@/hooks/useDiscordSession";
import { useHubProfiles } from "@/hooks/useHubProfiles";
import { useLinkedWallets } from "@/hooks/useLinkedWallets";

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
  const { discord: discordProfile } = useHubProfiles();
  const connected = status === "authenticated" && !!session?.user;
  const displayName = discordProfile?.username ?? "Discord";
  const displayImage = discordProfile?.image;

  if (connected) {
    return (
      <div
        className={`${btnClass(fullWidth)} border border-[#5865F2]/50 bg-[#5865F2]/15 text-[#5865F2]`}
      >
        {displayImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={displayImage} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/brand/discord.svg" alt="" className="h-4 w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{displayName}</span>
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
  const { twitter, twitterEnabled, loading, refresh } = useHubProfiles();
  const [unlinking, setUnlinking] = useState(false);

  const unlinkTwitter = async () => {
    const response = await fetch("/api/hub/social", { method: "DELETE" });
    if (!response.ok) {
      throw new Error("Failed to unlink X");
    }
    await refresh();
  };

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
  const { publicKey, connected, disconnect, signMessage, wallets, select } = useWallet();
  const { wallets: linkedWallets, linkWallet, unlinkWallet } = useLinkedWallets();
  const [linking, setLinking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const installedWallets = wallets.filter(
    (wallet) =>
      wallet.readyState === WalletReadyState.Installed ||
      wallet.readyState === WalletReadyState.Loadable,
  );

  useEffect(() => {
    if (!pickerOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [pickerOpen]);

  const handleConnectWallet = useCallback(
    async (wallet: AdapterWallet) => {
      setConnecting(true);
      setLinkError(null);
      setPickerOpen(false);

      try {
        select(wallet.adapter.name);
        await wallet.adapter.connect();

        const address = wallet.adapter.publicKey?.toBase58();
        if (!address) {
          throw new Error("Wallet did not return an address");
        }

        const alreadyLinked = linkedWallets.some((w) => w.address === address);
        if (alreadyLinked) return;

        const sign =
          "signMessage" in wallet.adapter && wallet.adapter.signMessage
            ? wallet.adapter.signMessage.bind(wallet.adapter)
            : signMessage;

        if (!sign) {
          throw new Error("This wallet does not support message signing");
        }

        setLinking(true);
        await linkWallet(address, sign);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to connect wallet";
        if (!message.toLowerCase().includes("user rejected")) {
          setLinkError(message);
        }
      } finally {
        setConnecting(false);
        setLinking(false);
      }
    },
    [linkedWallets, linkWallet, select, signMessage],
  );

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
    const address = publicKey.toBase58();
    const short = `${address.slice(0, 4)}…${address.slice(-4)}`;
    const isLinked = linkedWallets.some((w) => w.address === address);

    if (!isLinked) {
      return (
        <div className={`${fullWidth ? "w-full space-y-2" : "space-y-2"}`}>
          <div
            className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep`}
          >
            <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
            <span className="min-w-0 flex-1 truncate text-left font-mono">{short}</span>
            <DisconnectButton
              size="sm"
              title="Disconnect wallet"
              onClick={() => disconnect()}
            />
          </div>
          <button
            type="button"
            disabled={linking || connecting || !signMessage}
            onClick={() => {
              if (!signMessage) return;
              setLinking(true);
              setLinkError(null);
              void linkWallet(address, signMessage)
                .catch((err: Error) => setLinkError(err.message))
                .finally(() => setLinking(false));
            }}
            className={`${btnClass(fullWidth)} border border-accent-gold/40 bg-accent-gold/10 text-accent-gold hover:bg-accent-gold/20`}
          >
            {linking ? "Signing…" : "Sign to link wallet"}
          </button>
          {linkError && <p className="text-xs text-red-400">{linkError}</p>}
        </div>
      );
    }

    return (
      <div
        className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep`}
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        <span className="min-w-0 flex-1 truncate text-left font-mono">{short}</span>
        <DisconnectButton
          size="sm"
          title="Unlink wallet"
          onClick={() => {
            void unlinkWallet(address)
              .catch(() => undefined)
              .finally(() => disconnect());
          }}
        />
      </div>
    );
  }

  const linkedLabel =
    linkedWallets.length > 0
      ? `Connect${linkedWallets.length > 1 ? ` (${linkedWallets.length} linked)` : ""}`
      : "Connect";

  return (
    <div ref={pickerRef} className={`relative ${fullWidth ? "w-full" : ""}`}>
      <button
        type="button"
        disabled={connecting || linking}
        onClick={() => setPickerOpen((open) => !open)}
        className={`${btnClass(fullWidth)} bg-gradient-to-r from-[#9945FF] to-[#14F195] text-bg-deep hover:opacity-90`}
      >
        <Wallet className="h-4 w-4 shrink-0" strokeWidth={2.25} />
        {connecting || linking ? "Connecting…" : linkedLabel}
      </button>
      {pickerOpen && (
        <ul
          className={`absolute z-50 mt-2 overflow-hidden rounded-xl border border-white/10 bg-bg-deep shadow-xl ${
            fullWidth ? "left-0 right-0" : "left-0 min-w-[220px]"
          }`}
        >
          {installedWallets.length === 0 ? (
            <li className="px-4 py-3 text-sm text-text-muted">No Solana wallet detected</li>
          ) : (
            installedWallets.map((wallet) => (
              <li key={wallet.adapter.name}>
                <button
                  type="button"
                  disabled={connecting || linking}
                  onClick={() => void handleConnectWallet(wallet)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-text-primary transition hover:bg-white/5"
                >
                  {wallet.adapter.icon && (
                    <img
                      src={wallet.adapter.icon}
                      alt=""
                      className="h-6 w-6 rounded-md"
                    />
                  )}
                  {wallet.adapter.name}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
      {linkError && <p className="mt-2 text-xs text-red-400">{linkError}</p>}
    </div>
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

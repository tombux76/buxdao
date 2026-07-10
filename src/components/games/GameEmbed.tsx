"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, Menu, Music2, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { DiscordAuthButton } from "@/components/auth/DiscordAuthButton";
import { games } from "@/content/site";
import { GAME_CONFIG, type GameId } from "@/lib/games";

type GameEmbedProps = {
  gameId: GameId;
};

function PlayerAvatar({
  image,
  name,
  size = "md",
}: {
  image?: string | null;
  name?: string | null;
  size?: "sm" | "md";
}) {
  const dim = size === "sm" ? "h-8 w-8 text-[10px]" : "h-7 w-7 text-[10px]";
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={`${dim.split(" ")[0]} ${dim.split(" ")[1]} shrink-0 rounded-full`} />
    );
  }
  return (
    <div
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-accent-cyan/15 font-semibold text-accent-cyan`}
    >
      {(name ?? "?").charAt(0).toUpperCase()}
    </div>
  );
}

function formatWallet(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function GameEmbed({ gameId }: GameEmbedProps) {
  const config = GAME_CONFIG[gameId];
  const gameMeta = games.find((g) => g.id === gameId);
  const displayName = gameMeta?.name ?? config?.title ?? "Game";
  const thumbnail = gameMeta?.thumbnail;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { data: session, status: authStatus } = useSession();
  const pathname = usePathname();
  const [iframeWallet, setIframeWallet] = useState<string | null>(null);
  const [linkedWallets, setLinkedWallets] = useState<string[] | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const walletAddress = publicKey?.toBase58() ?? iframeWallet;
  const walletIsLinked =
    !walletAddress || linkedWallets === null
      ? true
      : linkedWallets.includes(walletAddress);

  const playerProfile = session?.user
    ? {
        name: session.user.name ?? null,
        image: session.user.image ?? null,
        discordUsername: session.user.name ?? null,
      }
    : null;

  useEffect(() => {
    if (!session?.user) {
      setLinkedWallets(null);
      return;
    }

    let cancelled = false;
    fetch("/api/hub/wallet")
      .then((response) => (response.ok ? response.json() : { wallets: [] }))
      .then((data: { wallets?: { address: string }[] }) => {
        if (!cancelled) {
          setLinkedWallets((data.wallets ?? []).map((wallet) => wallet.address));
        }
      })
      .catch(() => {
        if (!cancelled) setLinkedWallets([]);
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "WALLET_CONNECTED" && event.data.address) {
        setIframeWallet(event.data.address as string);
      }
      if (event.data?.type === "WALLET_DISCONNECTED") {
        setIframeWallet(null);
      }
      if (event.data?.type === "REQUEST_WALLET" && event.source) {
        const address = publicKey?.toBase58() ?? iframeWallet;
        if (address) {
          (event.source as Window).postMessage({ type: "WALLET_ADDRESS", address }, "*");
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [iframeWallet, publicKey]);

  const postToIframe = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const disconnectWallet = useCallback(() => {
    postToIframe({ type: "DISCONNECT_WALLET" });
    setIframeWallet(null);
    if (connected) disconnect();
    setMobileMenuOpen(false);
  }, [connected, disconnect, postToIframe]);

  const connectWallet = useCallback(() => {
    if (connected && publicKey) {
      postToIframe({ type: "WALLET_ADDRESS", address: publicKey.toBase58() });
    } else {
      setVisible(true);
      postToIframe({ type: "CONNECT_WALLET" });
    }
    setMobileMenuOpen(false);
  }, [connected, postToIframe, publicKey, setVisible]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!mobileMenuRef.current?.contains(event.target as Node)) {
        setMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (publicKey) {
      postToIframe({ type: "WALLET_ADDRESS", address: publicKey.toBase58() });
    }
  }, [publicKey, postToIframe]);

  useEffect(() => {
    if (playerProfile) {
      postToIframe({ type: "PLAYER_PROFILE", profile: playerProfile });
    }
  }, [playerProfile, postToIframe]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const syncIframeSession = () => {
      if (publicKey) {
        postToIframe({ type: "WALLET_ADDRESS", address: publicKey.toBase58() });
      } else if (iframeWallet) {
        postToIframe({ type: "WALLET_ADDRESS", address: iframeWallet });
      }
      if (playerProfile) {
        postToIframe({ type: "PLAYER_PROFILE", profile: playerProfile });
      }
    };

    iframe.addEventListener("load", syncIframeSession);
    return () => iframe.removeEventListener("load", syncIframeSession);
  }, [iframeWallet, playerProfile, postToIframe, publicKey]);

  if (!config) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Game not found.</p>
      </div>
    );
  }

  const iframeSrc = config.built && config.iframeSrc ? `${config.iframeSrc}?token=bux` : undefined;

  if (authStatus === "loading") {
    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center bg-bg-deep">
        <p className="text-muted">Loading…</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="fixed inset-0 z-[80] flex flex-col bg-bg-deep">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3">
          <Link
            href="/games"
            className="flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to games
          </Link>
        </header>
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="glass-panel max-w-md rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">Discord required</h2>
            <p className="mt-3 text-sm text-muted">
              Sign in with Discord to play BUX Casino. Your session carries over from the rest of
              the site.
            </p>
            <div className="mt-6 flex justify-center">
              <DiscordAuthButton callbackUrl={pathname || "/games"} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg-deep">
      <header className="flex shrink-0 items-center gap-3 border-b border-border bg-bg-elevated px-4 py-3">
        <Link
          href="/games"
          className="flex items-center gap-2 text-sm text-muted transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to games</span>
        </Link>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2.5">
          {thumbnail ? (
            <div
              className={`relative h-8 w-8 shrink-0 overflow-hidden sm:h-9 sm:w-9 ${
                gameId === "slots" ? "scale-110" : ""
              }`}
            >
              <Image
                src={thumbnail}
                alt=""
                fill
                unoptimized
                sizes="36px"
                className="object-contain"
              />
            </div>
          ) : null}
          <span className="truncate text-sm font-semibold">{displayName}</span>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={() => postToIframe({ type: "TOGGLE_MUSIC" })}
            className="rounded-lg p-2 text-muted hover:bg-bg-surface hover:text-foreground"
            aria-label="Toggle music"
          >
            <Music2 className="h-4 w-4" />
          </button>

          {/* Mobile: pfp + menu */}
          <div className="relative md:hidden" ref={mobileMenuRef}>
            {walletAddress ? (
              <>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen((open) => !open)}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-bg-surface p-1.5"
                  aria-expanded={mobileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Account menu"
                >
                  <PlayerAvatar
                    image={playerProfile?.image}
                    name={playerProfile?.name}
                    size="sm"
                  />
                  <Menu className="h-4 w-4 text-muted" />
                </button>
                {mobileMenuOpen ? (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-bg-elevated p-3 shadow-xl"
                  >
                    {playerProfile?.name ? (
                      <p className="truncate text-sm font-medium">{playerProfile.name}</p>
                    ) : null}
                    <p className="mt-1 font-mono text-xs text-muted">{formatWallet(walletAddress)}</p>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={disconnectWallet}
                      className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-left text-sm text-muted transition hover:bg-bg-surface hover:text-foreground"
                    >
                      Disconnect wallet
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              >
                <Wallet className="h-4 w-4" />
                <span className="sr-only">Connect</span>
              </button>
            )}
          </div>

          {/* Desktop: full wallet chip */}
          <div className="hidden md:flex md:items-center md:gap-2">
            {walletAddress ? (
              <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm">
                {playerProfile ? (
                  <PlayerAvatar image={playerProfile.image} name={playerProfile.name} />
                ) : (
                  <Wallet className="h-4 w-4 text-accent-cyan" />
                )}
                <div className="min-w-0">
                  {playerProfile?.name ? (
                    <p className="max-w-[8rem] truncate text-xs font-medium">{playerProfile.name}</p>
                  ) : null}
                  <p className="font-mono text-[10px] text-muted">{formatWallet(walletAddress)}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-muted hover:text-foreground"
                  onClick={disconnectWallet}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={connectWallet}
                className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
              >
                <Wallet className="h-4 w-4" />
                Connect
              </button>
            )}
          </div>
        </div>
      </header>

      {walletAddress && linkedWallets !== null && !walletIsLinked ? (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
          <p className="text-amber-100">
            Link <span className="font-mono">{formatWallet(walletAddress)}</span>{" "}
            in Holder Hub before you can play or collect.
          </p>
          <Link
            href="/hub"
            className="shrink-0 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-500/15"
          >
            Open Hub
          </Link>
        </div>
      ) : null}

      {iframeSrc ? (
        <iframe
          ref={iframeRef}
          title={displayName}
          src={iframeSrc}
          className="min-h-0 flex-1 border-0"
          allow="fullscreen"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="glass-panel rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">{displayName}</h2>
            <p className="mt-2 text-muted">Coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}

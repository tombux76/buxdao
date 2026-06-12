"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Music2, Wallet } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { GAME_CONFIG, type GameId } from "@/lib/games";

type GameEmbedProps = {
  gameId: GameId;
};

export function GameEmbed({ gameId }: GameEmbedProps) {
  const config = GAME_CONFIG[gameId];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [iframeWallet, setIframeWallet] = useState<string | null>(null);

  const walletAddress = publicKey?.toBase58() ?? iframeWallet;

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

  useEffect(() => {
    if (publicKey && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: "WALLET_ADDRESS", address: publicKey.toBase58() },
        "*",
      );
    }
  }, [publicKey]);

  const postToIframe = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  if (!config) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted">Game not found.</p>
      </div>
    );
  }

  const iframeSrc = config.built && config.iframeSrc ? `${config.iframeSrc}?token=bux` : undefined;

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
        <div className="flex-1 text-center">
          <span className="text-sm font-semibold">{config.title}</span>
          <span className="ml-2 text-xs text-accent-gold">$BUX</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => postToIframe({ type: "TOGGLE_MUSIC" })}
            className="rounded-lg p-2 text-muted hover:bg-bg-surface hover:text-foreground"
            aria-label="Toggle music"
          >
            <Music2 className="h-4 w-4" />
          </button>
          {walletAddress ? (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm">
              <Wallet className="h-4 w-4 text-accent-cyan" />
              <span>{walletAddress.slice(0, 4)}…{walletAddress.slice(-4)}</span>
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground"
                onClick={() => {
                  postToIframe({ type: "DISCONNECT_WALLET" });
                  setIframeWallet(null);
                  if (connected) disconnect();
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (connected && publicKey) {
                  postToIframe({ type: "WALLET_ADDRESS", address: publicKey.toBase58() });
                } else {
                  setVisible(true);
                  postToIframe({ type: "CONNECT_WALLET" });
                }
              }}
              className="flex items-center gap-2 rounded-xl border border-border bg-bg-surface px-3 py-2 text-sm"
            >
              <Wallet className="h-4 w-4" />
              Connect
            </button>
          )}
        </div>
      </header>

      {iframeSrc ? (
        <iframe
          ref={iframeRef}
          title={config.title}
          src={iframeSrc}
          className="min-h-0 flex-1 border-0"
          allow="fullscreen"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="glass-panel rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold">{config.title}</h2>
            <p className="mt-2 text-muted">Coming soon.</p>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useDiscordSession } from "@/hooks/useDiscordSession";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type LinkedWallet = {
  address: string;
  isPrimary: boolean;
  linkedAt: string;
};

type LinkedWalletsContextValue = {
  wallets: LinkedWallet[];
  loading: boolean;
  refresh: () => Promise<void>;
  linkWallet: (
    walletAddress: string,
    signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  ) => Promise<void>;
  unlinkWallet: (walletAddress: string) => Promise<void>;
};

const LinkedWalletsContext = createContext<LinkedWalletsContextValue | null>(null);

export function LinkedWalletsProvider({ children }: { children: ReactNode }) {
  const { discordConnected } = useDiscordSession();
  const [wallets, setWallets] = useState<LinkedWallet[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!discordConnected) {
      setWallets([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/hub/wallet");
      if (!response.ok) {
        setWallets([]);
        return;
      }
      const data = (await response.json()) as { wallets: LinkedWallet[] };
      setWallets(data.wallets);
    } catch {
      setWallets([]);
    } finally {
      setLoading(false);
    }
  }, [discordConnected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const linkWallet = useCallback(
    async (walletAddress: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) => {
      const challengeRes = await fetch("/api/hub/wallet/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      if (!challengeRes.ok) {
        const body = (await challengeRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to start wallet link");
      }

      const challenge = (await challengeRes.json()) as { nonce: string; message: string };
      const messageBytes = new TextEncoder().encode(challenge.message);
      const signatureBytes = await signMessage(messageBytes);
      const signature = bytesToBase64(signatureBytes);

      const linkRes = await fetch("/api/hub/wallet/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          nonce: challenge.nonce,
          signature,
          message: challenge.message,
        }),
      });
      if (!linkRes.ok) {
        const body = (await linkRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to link wallet");
      }

      await refresh();
    },
    [refresh],
  );

  const unlinkWallet = useCallback(
    async (walletAddress: string) => {
      const response = await fetch("/api/hub/wallet", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to unlink wallet");
      }
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ wallets, loading, refresh, linkWallet, unlinkWallet }),
    [wallets, loading, refresh, linkWallet, unlinkWallet],
  );

  return (
    <LinkedWalletsContext.Provider value={value}>{children}</LinkedWalletsContext.Provider>
  );
}

export function useLinkedWallets() {
  const context = useContext(LinkedWalletsContext);
  if (!context) {
    throw new Error("useLinkedWallets must be used within LinkedWalletsProvider");
  }
  return context;
}

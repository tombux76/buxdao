"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useWallet } from "@solana/wallet-adapter-react";

/** Disconnect the Solana wallet when the Discord session ends. */
export function useDisconnectWalletOnDiscordSignOut() {
  const { status } = useSession();
  const { connected, disconnect } = useWallet();
  const prevAuthStatus = useRef(status);

  useEffect(() => {
    if (prevAuthStatus.current === "authenticated" && status === "unauthenticated" && connected) {
      void disconnect();
    }
    prevAuthStatus.current = status;
  }, [status, connected, disconnect]);
}

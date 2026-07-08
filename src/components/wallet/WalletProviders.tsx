"use client";

import { useCallback, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletError, WalletConnectionError } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

type WalletProvidersProps = {
  children: React.ReactNode;
};

function getBrowserRpcEndpoint(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/solana/rpc`;
  }
  return "http://127.0.0.1:3000/api/solana/rpc";
}

function isUserRejectedWalletError(error: WalletError): boolean {
  if (error instanceof WalletConnectionError) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("user rejected") ||
    message.includes("user declined") ||
    message.includes("rejected the request")
  );
}

export function WalletProviders({ children }: WalletProvidersProps) {
  const rpcEndpoint = useMemo(() => getBrowserRpcEndpoint(), []);

  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      wsEndpoint: "wss://api.mainnet-beta.solana.com",
    }),
    [],
  );

  const onError = useCallback((error: WalletError) => {
    if (isUserRejectedWalletError(error)) {
      return;
    }
    console.error("[wallet]", error);
  }, []);

  return (
    <ConnectionProvider endpoint={rpcEndpoint} config={connectionConfig}>
      <WalletProvider wallets={[]} autoConnect onError={onError}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

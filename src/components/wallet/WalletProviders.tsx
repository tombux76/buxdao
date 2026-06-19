"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
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

export function WalletProviders({ children }: WalletProvidersProps) {
  const rpcEndpoint = useMemo(() => getBrowserRpcEndpoint(), []);

  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      wsEndpoint: "wss://api.mainnet-beta.solana.com",
    }),
    [],
  );

  return (
    <ConnectionProvider endpoint={rpcEndpoint} config={connectionConfig}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

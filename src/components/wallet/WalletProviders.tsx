"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

/** Public mainnet HTTP + WS — works in the browser without CORS issues. */
const CLIENT_RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

type WalletProvidersProps = {
  children: React.ReactNode;
};

export function WalletProviders({ children }: WalletProvidersProps) {
  const wallets = useMemo(() => [], []);

  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      wsEndpoint: "wss://api.mainnet-beta.solana.com",
    }),
    [],
  );

  return (
    <ConnectionProvider endpoint={CLIENT_RPC_ENDPOINT} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

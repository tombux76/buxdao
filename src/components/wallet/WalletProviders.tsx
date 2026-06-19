"use client";

import { useEffect, useMemo, useState } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import "@solana/wallet-adapter-react-ui/styles.css";

type WalletProvidersProps = {
  children: React.ReactNode;
};

export function WalletProviders({ children }: WalletProvidersProps) {
  const [endpoint, setEndpoint] = useState("https://api.mainnet-beta.solana.com");

  useEffect(() => {
    setEndpoint(`${window.location.origin}/api/solana/rpc`);
  }, []);

  const wallets = useMemo(() => [], []);

  const connectionConfig = useMemo(
    () => ({
      commitment: "confirmed" as const,
      // HTTP RPC uses our proxy; public WS for slot/signature subscriptions only.
      wsEndpoint: "wss://api.mainnet-beta.solana.com",
    }),
    [],
  );

  return (
    <ConnectionProvider endpoint={endpoint} config={connectionConfig}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

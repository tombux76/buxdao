"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

type WalletConnectButtonProps = {
  className?: string;
};

export function WalletConnectButton({ className }: WalletConnectButtonProps) {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    const address = publicKey.toBase58();
    return (
      <button type="button" onClick={() => disconnect()} className={className}>
        {address.slice(0, 4)}…{address.slice(-4)}
      </button>
    );
  }

  return (
    <button type="button" onClick={() => setVisible(true)} className={className}>
      Connect wallet
    </button>
  );
}

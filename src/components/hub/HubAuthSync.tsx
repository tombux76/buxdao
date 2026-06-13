"use client";

import { useDisconnectWalletOnDiscordSignOut } from "@/hooks/useDisconnectWalletOnDiscordSignOut";

export function HubAuthSync() {
  useDisconnectWalletOnDiscordSignOut();
  return null;
}

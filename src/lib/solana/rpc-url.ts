/** Server-side Solana RPC — private URLs (QuickNode, Helius) must not be used in the browser. */
export function getServerRpcUrl(): string {
  const explicit = process.env.SOLANA_RPC_URL?.trim();
  if (explicit) {
    return explicit;
  }

  const heliusKey = process.env.HELIUS_API_KEY?.trim();
  if (heliusKey) {
    return `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(heliusKey)}`;
  }

  return "https://api.mainnet-beta.solana.com";
}

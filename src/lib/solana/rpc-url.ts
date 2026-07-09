import { getHeliusRpcUrlCandidates } from "@/lib/helius-rpc";

function addUnique(urls: string[], url: string | undefined): void {
  const trimmed = url?.trim();
  if (trimmed && !urls.includes(trimmed)) {
    urls.push(trimmed);
  }
}

/** Ordered RPC endpoints for server-side use (browser goes through /api/solana/rpc). */
export function getServerRpcUrlCandidates(): string[] {
  const urls: string[] = [];

  addUnique(urls, process.env.SOLANA_RPC_URL);
  addUnique(urls, process.env.NEXT_PUBLIC_SOLANA_RPC_URL);

  for (const heliusUrl of getHeliusRpcUrlCandidates()) {
    addUnique(urls, heliusUrl);
  }

  addUnique(urls, "https://api.mainnet-beta.solana.com");

  return urls;
}

export function getServerRpcUrl(): string {
  return getServerRpcUrlCandidates()[0] ?? "https://api.mainnet-beta.solana.com";
}

export function getServerRpcHost(): string {
  try {
    return new URL(getServerRpcUrl()).host;
  } catch {
    return "unknown";
  }
}

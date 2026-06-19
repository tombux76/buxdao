import { Connection } from "@solana/web3.js";
import { getServerRpcUrlCandidates } from "@/lib/solana/rpc-url";

export async function withServerConnection<T>(
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  const candidates = getServerRpcUrlCandidates();
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const connection = new Connection(url, "confirmed");
      return await fn(connection);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[server-rpc]", url, lastError.message);
    }
  }

  throw lastError ?? new Error("RPC unavailable");
}

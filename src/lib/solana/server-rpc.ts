import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getServerRpcUrlCandidates } from "@/lib/solana/rpc-url";

const RPC_TIMEOUT_MS = 8_000;

function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

/** Fail fast — no web3.js 429 retry backoff; try the next candidate instead. */
function createFastFetch(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const response = await fetch(input, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response;
  };
}

function createConnection(url: string): Connection {
  return new Connection(url, {
    commitment: "confirmed",
    fetch: createFastFetch(RPC_TIMEOUT_MS),
  });
}

export async function withServerConnection<T>(
  fn: (connection: Connection) => Promise<T>,
): Promise<T> {
  const candidates = getServerRpcUrlCandidates();
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const connection = createConnection(url);
      return await fn(connection);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[server-rpc]", rpcHost(url), lastError.message);
    }
  }

  throw lastError ?? new Error("RPC unavailable");
}

export async function getWalletBalanceSol(wallet: string): Promise<number> {
  const candidates = getServerRpcUrlCandidates();
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getBalance",
          params: [wallet],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        error?: { message?: string };
        result?: { value?: number };
      };

      if (data.error) {
        throw new Error(data.error.message ?? "RPC error");
      }

      const lamports = data.result?.value;
      if (typeof lamports !== "number") {
        throw new Error("Invalid getBalance response");
      }

      return lamports / LAMPORTS_PER_SOL;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error("[server-rpc] getBalance", rpcHost(url), lastError.message);
    }
  }

  throw lastError ?? new Error("RPC unavailable");
}

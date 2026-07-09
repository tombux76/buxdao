import {
  Connection,
  LAMPORTS_PER_SOL,
  type Finality,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll RPC endpoints until a parsed transaction is visible (confirmed, then finalized). */
export async function getParsedTransactionWhenReady(
  signature: string,
  options?: { maxWaitMs?: number; pollMs?: number },
): Promise<ParsedTransactionWithMeta> {
  const maxWaitMs = options?.maxWaitMs ?? 60_000;
  const pollMs = options?.pollMs ?? 2_000;
  const commitments: Finality[] = ["confirmed", "finalized"];
  const candidates = getServerRpcUrlCandidates();
  const deadline = Date.now() + maxWaitMs;
  let lastError: Error | null = null;

  while (Date.now() < deadline) {
    for (const url of candidates) {
      try {
        const connection = createConnection(url);
        for (const commitment of commitments) {
          const tx = await connection.getParsedTransaction(signature, {
            maxSupportedTransactionVersion: 0,
            commitment,
          });

          if (tx?.meta?.err) {
            throw new Error("Transaction failed on-chain");
          }
          if (tx?.meta) {
            return tx;
          }
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.message === "Transaction failed on-chain") {
          throw lastError;
        }
        console.error("[server-rpc] getParsedTransaction", rpcHost(url), lastError.message);
      }
    }

    await sleep(pollMs);
  }

  throw lastError ?? new Error("Transaction not found on-chain yet — try again shortly");
}

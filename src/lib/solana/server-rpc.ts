import {
  Connection,
  LAMPORTS_PER_SOL,
  type Finality,
  type ParsedTransactionWithMeta,
} from "@solana/web3.js";
import { markHeliusKeyExhausted } from "@/lib/helius-rpc";
import { getServerRpcUrlCandidates } from "@/lib/solana/rpc-url";

const RPC_TIMEOUT_MS = 8_000;

function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "unknown";
  }
}

function shouldMarkHeliusExhausted(url: string, message: string): boolean {
  if (!url.includes("helius-rpc.com")) {
    return false;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes("429") ||
    lower.includes("401") ||
    lower.includes("402") ||
    lower.includes("403") ||
    lower.includes("rate limit") ||
    lower.includes("max usage") ||
    lower.includes("quota") ||
    lower.includes("too many requests")
  );
}

function noteRpcFailure(url: string, error: Error): void {
  console.error("[server-rpc]", rpcHost(url), error.message);
  if (shouldMarkHeliusExhausted(url, error.message)) {
    markHeliusKeyExhausted(url);
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

function createConnection(url: string, timeoutMs = RPC_TIMEOUT_MS): Connection {
  return new Connection(url, {
    commitment: "confirmed",
    fetch: createFastFetch(timeoutMs),
  });
}

export async function withServerConnection<T>(
  fn: (connection: Connection) => Promise<T>,
  options?: { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? RPC_TIMEOUT_MS;
  const candidates = getServerRpcUrlCandidates();
  let lastError: Error | null = null;

  for (const url of candidates) {
    try {
      const connection = createConnection(url, timeoutMs);
      return await fn(connection);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      noteRpcFailure(url, lastError);
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
      noteRpcFailure(url, lastError);
    }
  }

  throw lastError ?? new Error("RPC unavailable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type RawParsedTx = {
  meta?: ParsedTransactionWithMeta["meta"];
  transaction?: ParsedTransactionWithMeta["transaction"];
  blockTime?: number | null;
  slot?: number;
};

async function fetchParsedTransactionRaw(
  url: string,
  signature: string,
  commitment: Finality,
  timeoutMs: number,
): Promise<ParsedTransactionWithMeta | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "getTransaction",
      params: [
        signature,
        {
          encoding: "jsonParsed",
          commitment,
          maxSupportedTransactionVersion: 0,
        },
      ],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    result?: RawParsedTx | null;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? "RPC error");
  }

  if (!payload.result?.meta) {
    return null;
  }

  return payload.result as ParsedTransactionWithMeta;
}

/** Poll RPC endpoints until a parsed transaction is visible (confirmed, then finalized). */
export async function getParsedTransactionWhenReady(
  signature: string,
  options?: { maxWaitMs?: number; pollMs?: number },
): Promise<ParsedTransactionWithMeta> {
  const maxWaitMs = options?.maxWaitMs ?? 60_000;
  const pollMs = options?.pollMs ?? 2_000;
  const commitments: Finality[] = ["confirmed", "finalized"];
  // Prefer public mainnet early — paid RPCs (Helius/QuikNode) often 429/timeout and
  // burn the Vercel budget before we ever see the tx.
  const candidates = [
    "https://api.mainnet-beta.solana.com",
    ...getServerRpcUrlCandidates().filter((url) => !url.includes("api.mainnet-beta.solana.com")),
  ];
  const deadline = Date.now() + maxWaitMs;
  let lastError: Error | null = null;
  const fetchTimeoutMs = 12_000;

  while (Date.now() < deadline) {
    for (const url of candidates) {
      for (const commitment of commitments) {
        try {
          const tx = await fetchParsedTransactionRaw(url, signature, commitment, fetchTimeoutMs);
          if (tx?.meta?.err) {
            throw new Error("Transaction failed on-chain");
          }
          if (tx?.meta) {
            return tx;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (lastError.message === "Transaction failed on-chain") {
            throw lastError;
          }
          noteRpcFailure(url, lastError);
        }
      }
    }

    await sleep(pollMs);
  }

  throw lastError ?? new Error("Transaction not found on-chain yet — try again shortly");
}
